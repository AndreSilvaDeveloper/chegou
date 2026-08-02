import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { AssinaturaFatura, AssinaturaWebhookEvento } from '../../database/entities';
import { StatusWebhookEvento } from '../../database/entities/assinatura-webhook-evento.entity';
import { AuditService } from '../../common/audit/audit.service';
import { CobrancasService } from '../pagamentos/cobrancas.service';
import { EventoPagamento, lerEventoPagamento } from '../pagamentos/webhook-payload';
import { AssinaturaCobrancasService } from './assinatura-cobrancas.service';

/** Código do PostgreSQL para violação de unicidade. */
const UNIQUE_VIOLATION = '23505';

export interface ResultadoWebhook {
  /** `false` só quando o corpo é ilegível — o remetente não deve reenviar por isso. */
  aceito: boolean;
  duplicado?: boolean;
  motivo?: string;
}

/**
 * O dinheiro chegando: eventos de pagamento vindos do gateway.
 *
 * Quatro disciplinas, e nenhuma é detalhe:
 *
 * 1. **Gravar primeiro, processar depois.** O controller responde 200 assim que
 *    o evento está no banco. Webhook que processa em linha é webhook que o
 *    remetente considera falho por timeout — e reenvia, multiplicando o
 *    trabalho justamente quando o sistema está lento.
 * 2. **Deduplicar pelo id do evento.** Repetição é normal (o remetente reenvia
 *    quando não recebe 200 a tempo). O índice único é o que impede a segunda
 *    entrega de dar baixa de novo.
 * 3. **Fora de ordem é normal.** `RECEIVED` pode chegar antes de `CONFIRMED`.
 *    A comparação é por **precedência de estado**, nunca por ordem de chegada.
 * 4. **Evento de fatura desconhecida não é erro.** Pode ser cobrança de outro
 *    sistema na mesma company. Registra e ignora.
 */
@Injectable()
export class WebhookPagamentoService {
  private readonly logger = new Logger(WebhookPagamentoService.name);

  constructor(
    @InjectRepository(AssinaturaWebhookEvento)
    private readonly eventoRepo: Repository<AssinaturaWebhookEvento>,
    @InjectRepository(AssinaturaFatura)
    private readonly faturaRepo: Repository<AssinaturaFatura>,
    private readonly cobrancas: CobrancasService,
    private readonly faturaCobrancas: AssinaturaCobrancasService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Recebe o evento: grava, deduplica e processa.
   *
   * O processamento acontece aqui mesmo, e não numa fila, porque ele é curto
   * (uma consulta e um update) e porque a fila acrescentaria um lugar a mais
   * onde um evento pode se perder. O que protege o tempo de resposta é a
   * gravação vir **antes** — se o processamento falhar, o evento já está no
   * banco e a conciliação o alcança.
   */
  async receber(corpo: unknown): Promise<ResultadoWebhook> {
    const evento = lerEventoPagamento(corpo);

    if (!evento) {
      // Sem id não há como deduplicar, e processar sem dedup é aceitar dar baixa
      // duas vezes. Guardamos o corpo para poder olhar depois: um formato que o
      // parser não entende é informação, não lixo.
      await this.guardarIlegivel(corpo);
      return { aceito: false, motivo: 'Evento sem identificador' };
    }

    const linha = await this.registrar(evento, corpo);
    if (!linha) return { aceito: true, duplicado: true };

    await this.processar(linha, evento);
    return { aceito: true };
  }

  /**
   * Grava a linha do evento. `null` quando ele já tinha chegado.
   *
   * A deduplicação é o **índice único no banco**, não uma consulta antes de
   * inserir: duas entregas simultâneas do mesmo evento passariam as duas pela
   * consulta e as duas dariam baixa. A corrida só é resolvida no `INSERT`.
   */
  private async registrar(
    evento: EventoPagamento,
    corpo: unknown,
  ): Promise<AssinaturaWebhookEvento | null> {
    try {
      return await this.eventoRepo.save(
        this.eventoRepo.create({
          eventoId: evento.eventoId,
          tipo: evento.tipo,
          cobrancaId: evento.cobrancaId,
          payload: corpo as Record<string, unknown>,
          recebidoEm: new Date(),
          status: StatusWebhookEvento.PENDENTE,
        }),
      );
    } catch (err) {
      if (err instanceof QueryFailedError && (err as { code?: string }).code === UNIQUE_VIOLATION) {
        this.logger.debug(`Evento ${evento.eventoId} repetido — ignorado`);
        return null;
      }
      throw err;
    }
  }

  private async processar(
    linha: AssinaturaWebhookEvento,
    evento: EventoPagamento,
  ): Promise<void> {
    try {
      const fatura = await this.acharFatura(evento);
      if (!fatura) {
        await this.encerrar(linha, StatusWebhookEvento.IGNORADO, 'Nenhuma fatura correspondente');
        return;
      }

      const statusGateway = await this.statusDaCobranca(evento, fatura);
      if (!statusGateway) {
        await this.encerrar(
          linha,
          StatusWebhookEvento.IGNORADO,
          'Evento sem estado de cobrança utilizável',
        );
        return;
      }

      const antes = fatura.status;
      const mudou = await this.faturaCobrancas.aplicarEstadoDoGateway(fatura, statusGateway);

      linha.faturaId = fatura.id;
      await this.encerrar(
        linha,
        StatusWebhookEvento.PROCESSADO,
        mudou ? `${antes} → ${fatura.status}` : `sem mudança (já em ${antes})`,
      );

      if (mudou) {
        // Toda mudança de dinheiro vinda de fora fica no log: é o que permite
        // responder "por que esta fatura mudou sozinha?" meses depois.
        await this.audit.log({
          action: 'assinatura.fatura.webhook',
          entity: 'assinatura_faturas',
          entityId: fatura.id,
          diffJson: { de: antes, para: fatura.status, evento: evento.eventoId, statusGateway },
        });
      }
    } catch (err) {
      const detalhe = (err as Error).message;
      this.logger.error(`Evento ${evento.eventoId} falhou: ${detalhe}`);
      await this.encerrar(linha, StatusWebhookEvento.ERRO, detalhe);
    }
  }

  /**
   * Qual é o estado da cobrança, de verdade.
   *
   * Quando o evento traz o status **de dentro do objeto da cobrança**, ele vale.
   * Caso contrário — envelope achatado, formato que não conhecemos — consulta-se
   * o gateway. Custa uma chamada e elimina a chance de confundir o status do
   * *processamento do evento* com o do *pagamento*, que marcaria fatura como
   * paga por engano.
   */
  private async statusDaCobranca(
    evento: EventoPagamento,
    fatura: AssinaturaFatura,
  ): Promise<string | null> {
    if (evento.status && evento.statusConfiavel) return evento.status;
    if (!fatura.cobrancaId || !this.cobrancas.ligado) return evento.status;

    try {
      return (await this.cobrancas.consultar(fatura.cobrancaId)).statusGateway;
    } catch (err) {
      this.logger.warn(
        `Não deu para confirmar a cobrança ${fatura.cobrancaId} no gateway: ${(err as Error).message}`,
      );
      return evento.status;
    }
  }

  /**
   * Acha a fatura do evento, na ordem de confiabilidade das correlações.
   *
   * `externalReference` primeiro porque **é o id da nossa fatura** — a
   * correlação que sobrevive até a perda do `cobranca_id`. Os outros dois são
   * rede de segurança para um evento que não a carregue.
   */
  private async acharFatura(evento: EventoPagamento): Promise<AssinaturaFatura | null> {
    if (evento.referenciaExterna) {
      const porRef = await this.faturaRepo.findOne({ where: { id: evento.referenciaExterna } });
      if (porRef) return porRef;
    }
    if (evento.cobrancaId) {
      const porCobranca = await this.faturaRepo.findOne({
        where: { cobrancaId: evento.cobrancaId },
      });
      if (porCobranca) return porCobranca;
    }
    if (evento.asaasId) {
      return this.faturaRepo.findOne({ where: { cobrancaAsaasId: evento.asaasId } });
    }
    return null;
  }

  private async encerrar(
    linha: AssinaturaWebhookEvento,
    status: StatusWebhookEvento,
    detalhe: string,
  ): Promise<void> {
    await this.eventoRepo.update(linha.id, {
      status,
      detalhe: detalhe.slice(0, 500),
      faturaId: linha.faturaId,
      tentativas: linha.tentativas + 1,
      processadoEm: new Date(),
    });
  }

  /** Corpo que o parser não entendeu: guarda para investigação, sem dedup. */
  private async guardarIlegivel(corpo: unknown): Promise<void> {
    await this.eventoRepo
      .save(
        this.eventoRepo.create({
          // Sem id do remetente, um id nosso: a linha existe para ser lida por
          // gente, não para deduplicar.
          eventoId: `ilegivel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          payload: (corpo ?? {}) as Record<string, unknown>,
          recebidoEm: new Date(),
          status: StatusWebhookEvento.ERRO,
          detalhe: 'Corpo sem identificador de evento reconhecível',
        }),
      )
      .catch((err) => this.logger.error(`Não deu para guardar evento ilegível: ${err.message}`));
  }
}
