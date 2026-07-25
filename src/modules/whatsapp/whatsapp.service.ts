import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Encomenda, Morador, WhatsappMessage } from '../../database/entities';
import { OpenwaService } from '../openwa/openwa.service';
import { renderTemplate, TemplateKey, TemplateVariables } from './templates';

/** Provedor gravado no histórico — hoje só existe o gateway próprio (OpenWA). */
export const PROVIDER = 'openwa';

/** Compara números de formatos diferentes ("whatsapp:+55...", "+55 11 ..."). */
function somenteDigitos(valor: string | null | undefined): string {
  return (valor ?? '').replace(/\D/g, '');
}

/** Mensagem recebida, já traduzida do formato do gateway. */
export interface InboundMessage {
  providerMessageId: string;
  from: string;
  to: string;
  body: string;
  messageType: 'text' | 'image' | 'interactive' | 'template' | 'system';
  receivedAt: Date;
  raw: Record<string, unknown>;
}

export interface SendOutboundParams<K extends TemplateKey> {
  tenantId: string;
  encomendaId?: string;
  moradorId?: string;
  to: string;
  templateKey: K;
  variables: TemplateVariables[K];
  idempotencyKey: string;
}

/**
 * Histórico de mensagens e resposta automática ao morador.
 *
 * O disparo em massa NÃO passa por aqui — ele vai pela fila de notificações,
 * que aplica janela de horário e ritmo anti-bloqueio. Este service cuida do que
 * é reativo: registrar o que entrou e responder na hora quem perguntou o código.
 */
@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  constructor(
    @InjectRepository(WhatsappMessage) private readonly msgRepo: Repository<WhatsappMessage>,
    @InjectRepository(Morador) private readonly moradorRepo: Repository<Morador>,
    @InjectRepository(Encomenda) private readonly encomendaRepo: Repository<Encomenda>,
    private readonly openwa: OpenwaService,
  ) {}

  /**
   * Resposta imediata a quem escreveu, pelo número do próprio condomínio.
   *
   * Vai direto ao gateway, sem fila: é réplica a uma mensagem que o morador
   * acabou de mandar — a janela de 24h do WhatsApp está aberta e segurar isso
   * numa fila de ritmo transformaria uma conversa em silêncio.
   */
  async sendTemplated<K extends TemplateKey>(
    params: SendOutboundParams<K>,
  ): Promise<WhatsappMessage> {
    const existing = await this.msgRepo.findOne({
      where: { tenantId: params.tenantId, idempotencyKey: params.idempotencyKey },
    });
    if (existing && ['sent', 'delivered', 'read'].includes(existing.status)) {
      this.logger.log(`Mensagem já enviada (idempotencyKey=${params.idempotencyKey}), skipping`);
      return existing;
    }

    const body = renderTemplate(params.templateKey, params.variables);

    const message =
      existing ??
      this.msgRepo.create({
        tenantId: params.tenantId,
        encomendaId: params.encomendaId ?? null,
        moradorId: params.moradorId ?? null,
        direction: 'out',
        provider: PROVIDER,
        // O número de origem é o da sessão do condomínio no gateway; quem sabe
        // qual é, é o OpenWA — aqui fica vazio em vez de um valor inventado.
        fromNumber: '',
        toNumber: params.to,
        messageType: 'text',
        templateName: params.templateKey,
        body,
        status: 'queued',
        idempotencyKey: params.idempotencyKey,
        payloadJson: { variables: params.variables },
      });
    await this.msgRepo.save(message);

    try {
      const { messageId } = await this.openwa.sendText(params.tenantId, params.to, body);
      message.providerMessageId = messageId;
      message.status = 'sent';
      await this.msgRepo.save(message);
      return message;
    } catch (err) {
      message.status = 'failed';
      message.errorMessage = err instanceof Error ? err.message : String(err);
      await this.msgRepo.save(message);
      throw err;
    }
  }

  /**
   * De quem é a mensagem que chegou — e, por tabela, de qual condomínio.
   *
   * O mesmo telefone pode estar cadastrado em mais de um condomínio (alguém que
   * mora em dois, ou um síndico). Nesse caso o número de destino desempata,
   * porque cada condomínio tem o seu no gateway. Se nem assim der para saber, a
   * mensagem fica sem dono: atribuir ao condomínio errado significaria dar baixa
   * em encomenda alheia.
   */
  private async resolverMoradorInbound(inbound: InboundMessage): Promise<Morador | null> {
    const candidatos = await this.moradorRepo.find({
      where: { telefoneE164: inbound.from, ativo: true },
      relations: { tenant: true },
    });

    if (candidatos.length === 0) {
      this.logger.warn(
        `Inbound de número desconhecido: ${inbound.from} (msg=${inbound.providerMessageId})`,
      );
      return null;
    }
    if (candidatos.length === 1) return candidatos[0];

    const destino = somenteDigitos(inbound.to);
    const doDestino = candidatos.filter(
      (m) => destino && somenteDigitos(m.tenant?.whatsappNumero) === destino,
    );
    if (doDestino.length === 1) return doDestino[0];

    this.logger.warn(
      `Inbound ambíguo: ${inbound.from} está em ${candidatos.length} condomínios e o destino ` +
        `${inbound.to} não desempatou — mensagem registrada sem condomínio (msg=${inbound.providerMessageId})`,
    );
    return null;
  }

  /**
   * Registra a mensagem recebida. Idempotente por `providerMessageId`: o gateway
   * reentrega o mesmo evento, e reprocessar daria resposta duplicada ao morador.
   */
  async recordInbound(inbound: InboundMessage): Promise<WhatsappMessage> {
    const existing = await this.msgRepo.findOne({
      where: { provider: PROVIDER, providerMessageId: inbound.providerMessageId },
    });
    if (existing) return existing;

    const morador = await this.resolverMoradorInbound(inbound);

    return this.msgRepo.save(
      this.msgRepo.create({
        tenantId: morador?.tenantId ?? null,
        moradorId: morador?.id ?? null,
        direction: 'in',
        provider: PROVIDER,
        providerMessageId: inbound.providerMessageId,
        fromNumber: inbound.from,
        toNumber: inbound.to,
        messageType: inbound.messageType,
        body: inbound.body,
        status: 'received',
        payloadJson: inbound.raw,
      }),
    );
  }

  /**
   * O morador escreveu — se for sobre retirada, responde com o código pendente.
   *
   * Mensagem sem condomínio identificado não vira intenção: responder seria
   * falar em nome do condomínio errado.
   */
  async handleInboundIntent(message: WhatsappMessage): Promise<void> {
    if (message.direction !== 'in' || !message.body || !message.moradorId || !message.tenantId) {
      return;
    }
    const lower = message.body.toLowerCase().trim();
    const retirar = /(retirar|vou retirar|estou indo|cheguei|chegando|ok|sim)/i.test(lower);
    const codigo = /(codigo|código)/i.test(lower);

    if (!retirar && !codigo) return;

    const morador = await this.moradorRepo.findOne({
      where: { id: message.moradorId, tenantId: message.tenantId, ativo: true },
      relations: { apartamento: true },
    });
    if (!morador?.telefoneE164 || !morador.receberWhatsapp) return;

    const encomenda = await this.encomendaRepo
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.apartamento', 'a')
      .leftJoinAndSelect('e.tenant', 't')
      .where('e.tenantId = :tenantId', { tenantId: message.tenantId })
      .andWhere('e.apartamentoId = :aptoId', { aptoId: morador.apartamentoId })
      .andWhere('e.status IN (:...status)', { status: ['aguardando', 'notificado'] })
      .orderBy('e.createdAt', 'DESC')
      .getOne();

    const nome = morador.nome.split(' ')[0];

    if (!encomenda) {
      await this.sendTemplated({
        tenantId: message.tenantId,
        moradorId: morador.id,
        to: morador.telefoneE164,
        templateKey: 'sem_encomenda_pendente',
        variables: { nome },
        idempotencyKey: `inbound:${message.id}:no-encomenda`,
      });
      return;
    }

    await this.sendTemplated({
      tenantId: message.tenantId,
      encomendaId: encomenda.id,
      moradorId: morador.id,
      to: morador.telefoneE164,
      templateKey: 'lembrete_codigo',
      variables: {
        nome,
        apartamento: encomenda.apartamento!.identificador,
        codigo: encomenda.codigoRetirada,
      },
      idempotencyKey: `inbound:${message.id}:lembrete`,
    });
  }
}
