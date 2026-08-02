import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan, Not, Repository } from 'typeorm';
import { AssinaturaFatura } from '../../database/entities';
import {
  StatusCobranca,
  StatusFatura,
} from '../../database/entities/assinatura-fatura.entity';
import { AuditService } from '../../common/audit/audit.service';
import { CobrancasService } from '../pagamentos/cobrancas.service';
import { estadoTerminal } from '../pagamentos/status-cobranca';
import { AssinaturaCobrancasService } from './assinatura-cobrancas.service';

export interface ResultadoConciliacao {
  /** `false` quando não há gateway: a rotina não roda e a tela diz isso. */
  ligada: boolean;
  conferidas: number;
  divergentes: number;
  falhas: number;
  /** Faturas emitidas há mais de 24h sem cobrança — alerta, não conserto. */
  semCobranca: number;
  detalhes: { faturaId: string; de: string; para: string }[];
}

/** Faturas por rodada. Teto para uma conciliação não virar varredura infinita. */
const LOTE = 200;

/**
 * A conciliação: o webhook que se perdeu.
 *
 * **Nenhuma integração de dinheiro pode depender só de evento.** Webhook cai,
 * URL muda, um deploy derruba o endpoint por dois minutos — e nenhuma dessas
 * três coisas pode custar uma baixa. Esta rotina relê o estado de cada cobrança
 * viva direto do gateway e aplica o que encontrar.
 *
 * ### Por que ela substitui o "pull de eventos" do plano
 *
 * O plano previa varrer `GET /webhooks/events` a cada 15 min como rede de
 * segurança. Ao implementar, dois fatos mudaram a conta:
 *
 * 1. Aquele endpoint devolve o **evento** (`processedResourceId`,
 *    `processingSummary` em texto livre), não o **estado da cobrança**. Para
 *    saber o status seria preciso um `GET /charges/{id}` de qualquer forma.
 * 2. Reler a cobrança é **estritamente mais confiável** que reprocessar um log
 *    de eventos: lê a verdade de agora, sem depender de nenhum evento ter sido
 *    registrado do lado de lá.
 *
 * Então a varredura por `GET /charges/{id}` é a rede de segurança — e roda de
 * hora em hora, não uma vez por dia, para cobrir a mesma latência que o pull
 * cobriria. O volume permite: são as faturas **não terminais**, uma por cliente
 * por mês.
 */
@Injectable()
export class ConciliacaoService {
  private readonly logger = new Logger(ConciliacaoService.name);

  constructor(
    @InjectRepository(AssinaturaFatura) private readonly repo: Repository<AssinaturaFatura>,
    private readonly cobrancas: CobrancasService,
    private readonly faturaCobrancas: AssinaturaCobrancasService,
    private readonly audit: AuditService,
  ) {}

  /**
   * A rodada agendada, chamada pelo job repetível de hora em hora.
   *
   * O agendamento é **BullMQ repeatable**, e não `@nestjs/schedule`: a fila já
   * está na stack, e o repeatable do BullMQ é coordenado pelo Redis — com duas
   * réplicas, `@Cron` rodaria a conciliação duas vezes, cada uma consultando o
   * gateway pelas mesmas faturas.
   */
  async rodarAgendada(): Promise<void> {
    if (!this.cobrancas.ligado) return;
    const r = await this.conciliar();
    if (r.divergentes || r.falhas || r.semCobranca) {
      this.logger.warn(
        `Conciliação: ${r.divergentes} divergente(s), ${r.falhas} falha(s), ${r.semCobranca} sem cobrança`,
      );
    }
  }

  /**
   * Confere cada cobrança viva contra o gateway.
   *
   * Divergência **aplica o estado do gateway e registra no `audit_log`** com o
   * antes e o depois. Ela nunca é corrigida no outro sentido: o gateway é a
   * fonte da verdade sobre pagamento, e "consertar" lá a partir daqui
   * transformaria um erro de leitura em movimento de dinheiro.
   */
  async conciliar(): Promise<ResultadoConciliacao> {
    if (!this.cobrancas.ligado) {
      return { ligada: false, conferidas: 0, divergentes: 0, falhas: 0, semCobranca: 0, detalhes: [] };
    }

    const faturas = await this.repo.find({
      where: { cobrancaId: Not(IsNull()) },
      order: { vencimento: 'DESC' },
      take: LOTE,
    });

    const vivas = faturas.filter((f) => !estadoTerminal(f.status));
    const detalhes: ResultadoConciliacao['detalhes'] = [];
    let divergentes = 0;
    let falhas = 0;

    for (const fatura of vivas) {
      try {
        const cobranca = await this.cobrancas.consultar(fatura.cobrancaId!);
        const antes = fatura.status;

        // Divergência de VALOR é alarme, nunca correção automática. A fatura é
        // a fonte da verdade do que o cliente deve; um valor diferente do outro
        // lado indica regra aplicada lá que a nossa conta não conhece, e
        // ajustar em silêncio esconderia exatamente o que precisa ser visto.
        if (Math.abs(cobranca.valor - fatura.valor) >= 0.01) {
          this.logger.error(
            `Fatura ${fatura.id}: nós ${fatura.valor}, gateway ${cobranca.valor} — divergência de valor`,
          );
          await this.audit.log({
            action: 'assinatura.conciliacao.valor_divergente',
            entity: 'assinatura_faturas',
            entityId: fatura.id,
            diffJson: { nosso: fatura.valor, gateway: cobranca.valor },
          });
        }

        const mudou = await this.faturaCobrancas.aplicarEstadoDoGateway(
          fatura,
          cobranca.statusGateway,
        );
        if (mudou) {
          divergentes++;
          detalhes.push({ faturaId: fatura.id, de: antes, para: fatura.status });
          await this.audit.log({
            action: 'assinatura.conciliacao.status',
            entity: 'assinatura_faturas',
            entityId: fatura.id,
            diffJson: { de: antes, para: fatura.status, statusGateway: cobranca.statusGateway },
          });
        }
      } catch (err) {
        falhas++;
        this.logger.warn(`Conciliação da fatura ${fatura.id} falhou: ${(err as Error).message}`);
      }
    }

    return {
      ligada: true,
      conferidas: vivas.length,
      divergentes,
      falhas,
      semCobranca: (await this.faturasSemCobranca()).length,
      detalhes,
    };
  }

  /**
   * Faturas em aberto há mais de 24h que nunca viraram cobrança.
   *
   * É **alerta, não conserto**: a emissão tem fila e retry próprios, então uma
   * fatura que passou o dia sem cobrança tem um problema que repetir não
   * resolve — cliente sem documento, erro de configuração. Aparece na tela para
   * alguém olhar.
   */
  async faturasSemCobranca(): Promise<AssinaturaFatura[]> {
    const ontem = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return this.repo.find({
      where: [
        { cobrancaId: IsNull(), status: StatusFatura.ABERTA, createdAt: LessThan(ontem) },
        { cobrancaId: IsNull(), status: StatusFatura.VENCIDA, createdAt: LessThan(ontem) },
      ],
      order: { createdAt: 'ASC' },
      take: LOTE,
    });
  }

  /** Faturas com baixa aplicada aqui que o gateway ainda não confirmou. */
  async dessincronizadas(): Promise<AssinaturaFatura[]> {
    return this.repo.find({
      where: { cobrancaDessincronizada: true, cobrancaStatus: StatusCobranca.EMITIDA },
      order: { vencimento: 'ASC' },
      take: LOTE,
    });
  }
}
