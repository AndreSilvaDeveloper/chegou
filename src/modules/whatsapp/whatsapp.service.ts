import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { Encomenda, Morador, WhatsappMessage } from '../../database/entities';
import { QUEUE_CONFIRMAR_RETIRADA, QUEUE_NOTIFY_MORADOR } from '../../queues/queues.module';
import { WHATSAPP_GATEWAY, WhatsappGateway } from './gateway/whatsapp.gateway';
import { InboundMessage, StatusUpdate } from './gateway/types';
import { renderTemplate, TemplateKey, templateToVariables, TemplateVariables } from './templates';

export interface NotifyMoradorJob {
  encomendaId: string;
  tenantId: string;
}

export interface ConfirmarRetiradaJob {
  encomendaId: string;
  tenantId: string;
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

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly sandboxMode: boolean;

  constructor(
    @Inject(WHATSAPP_GATEWAY) private readonly gateway: WhatsappGateway,
    @InjectRepository(WhatsappMessage) private readonly msgRepo: Repository<WhatsappMessage>,
    @InjectRepository(Morador) private readonly moradorRepo: Repository<Morador>,
    @InjectRepository(Encomenda) private readonly encomendaRepo: Repository<Encomenda>,
    @InjectQueue(QUEUE_NOTIFY_MORADOR) private readonly notifyQueue: Queue<NotifyMoradorJob>,
    @InjectQueue(QUEUE_CONFIRMAR_RETIRADA) private readonly confirmarQueue: Queue<ConfirmarRetiradaJob>,
    private readonly config: ConfigService,
  ) {
    this.sandboxMode = config.get<boolean>('WHATSAPP_SANDBOX_MODE', false);
  }

  async enqueueNotifyMorador(payload: NotifyMoradorJob): Promise<void> {
    await this.notifyQueue.add('notify', payload, {
      jobId: `encomenda:${payload.encomendaId}:notify`,
    });
  }

  async enqueueConfirmarRetirada(payload: ConfirmarRetiradaJob): Promise<void> {
    await this.confirmarQueue.add('confirmar', payload, {
      jobId: `encomenda:${payload.encomendaId}:confirmar`,
    });
  }

  async sendTemplated<K extends TemplateKey>(params: SendOutboundParams<K>): Promise<WhatsappMessage> {
    const existing = await this.msgRepo.findOne({
      where: { tenantId: params.tenantId, idempotencyKey: params.idempotencyKey },
    });
    if (existing && ['sent', 'delivered', 'read'].includes(existing.status)) {
      this.logger.log(`Mensagem já enviada (idempotencyKey=${params.idempotencyKey}), skipping`);
      return existing;
    }

    const fromNumber = this.config.getOrThrow<string>('WHATSAPP_FROM_NUMBER');
    const body = renderTemplate(params.templateKey, params.variables);

    const message =
      existing ??
      this.msgRepo.create({
        tenantId: params.tenantId,
        encomendaId: params.encomendaId ?? null,
        moradorId: params.moradorId ?? null,
        direction: 'out',
        provider: this.gateway.provider,
        fromNumber,
        toNumber: params.to,
        messageType: this.sandboxMode ? 'text' : 'template',
        templateName: params.templateKey,
        body,
        status: 'queued',
        idempotencyKey: params.idempotencyKey,
        payloadJson: { variables: params.variables },
      });
    await this.msgRepo.save(message);

    try {
      const result = this.sandboxMode
        ? await this.gateway.sendText({ to: params.to, body })
        : await this.gateway.sendTemplate({
            to: params.to,
            templateName: params.templateKey,
            variables: templateToVariables(params.variables),
          });

      message.providerMessageId = result.providerMessageId;
      message.status = 'sent';
      message.payloadJson = {
        ...message.payloadJson,
        rawResponse: result.rawResponse as Record<string, unknown>,
      };
      await this.msgRepo.save(message);
      return message;
    } catch (err) {
      message.status = 'failed';
      message.errorMessage = err instanceof Error ? err.message : String(err);
      await this.msgRepo.save(message);
      throw err;
    }
  }

  async recordInbound(inbound: InboundMessage): Promise<WhatsappMessage> {
    const existing = await this.msgRepo.findOne({
      where: { provider: this.gateway.provider, providerMessageId: inbound.providerMessageId },
    });
    if (existing) return existing;

    const morador = await this.moradorRepo.findOne({
      where: { telefoneE164: inbound.from, ativo: true },
    });
    if (!morador) {
      this.logger.warn(`Inbound de número desconhecido: ${inbound.from} (msg=${inbound.providerMessageId})`);
    }

    return this.msgRepo.save(
      this.msgRepo.create({
        tenantId: morador?.tenantId ?? null,
        moradorId: morador?.id ?? null,
        direction: 'in',
        provider: this.gateway.provider,
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

  async recordStatus(update: StatusUpdate): Promise<void> {
    const msg = await this.msgRepo.findOne({
      where: { provider: this.gateway.provider, providerMessageId: update.providerMessageId },
    });
    if (!msg) {
      this.logger.warn(`Status update para mensagem desconhecida: ${update.providerMessageId}`);
      return;
    }
    msg.status = update.status;
    if (update.errorMessage) msg.errorMessage = update.errorMessage;
    await this.msgRepo.save(msg);
  }

  get isSandboxMode(): boolean {
    return this.sandboxMode;
  }
}
