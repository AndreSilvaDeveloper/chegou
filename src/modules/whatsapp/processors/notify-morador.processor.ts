import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { Repository } from 'typeorm';
import { Encomenda, Morador } from '../../../database/entities';
import { QUEUE_NOTIFY_MORADOR } from '../../../queues/queues.module';
import { SmsGateway } from '../gateway/sms.gateway';
import { renderTemplate } from '../templates';
import { NotifyMoradorJob, WhatsappService } from '../whatsapp.service';

@Processor(QUEUE_NOTIFY_MORADOR)
export class NotifyMoradorProcessor extends WorkerHost {
  private readonly logger = new Logger(NotifyMoradorProcessor.name);

  constructor(
    @InjectRepository(Encomenda) private readonly encomendaRepo: Repository<Encomenda>,
    @InjectRepository(Morador) private readonly moradorRepo: Repository<Morador>,
    private readonly whatsapp: WhatsappService,
    private readonly sms: SmsGateway,
  ) {
    super();
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<NotifyMoradorJob>, err: Error) {
    if (job.attemptsMade < (job.opts.attempts ?? 5)) return;
    if (!this.sms.isConfigured) {
      this.logger.warn(`WhatsApp falhou e SMS não configurado — sem fallback`);
      return;
    }
    try {
      const { encomendaId, tenantId } = job.data;
      const encomenda = await this.encomendaRepo.findOne({
        where: { id: encomendaId, tenantId },
        relations: { apartamento: true, tenant: true, moradorDestino: true },
      });
      if (!encomenda) return;
      const morador =
        encomenda.moradorDestino ??
        (await this.moradorRepo.findOne({
          where: { tenantId, apartamentoId: encomenda.apartamentoId, principal: true, ativo: true },
        }));
      if (!morador?.telefoneE164) return;
      const body = renderTemplate('encomenda_chegou', {
        nome: morador.nome.split(' ')[0],
        apartamento: encomenda.apartamento!.identificador,
        codigo: encomenda.codigoRetirada,
        condominio: encomenda.tenant!.nome,
      });
      await this.sms.sendSms(morador.telefoneE164, body);
      this.logger.log(`SMS fallback enviado pra encomenda ${encomendaId} (Whats falhou: ${err.message})`);
    } catch (smsErr) {
      this.logger.error(`SMS fallback também falhou`, smsErr instanceof Error ? smsErr.stack : smsErr);
    }
  }

  async process(job: Job<NotifyMoradorJob>): Promise<void> {
    const { encomendaId, tenantId } = job.data;
    this.logger.log(`Processando notificação: encomenda=${encomendaId}`);

    const encomenda = await this.encomendaRepo.findOne({
      where: { id: encomendaId, tenantId },
      relations: { apartamento: true, tenant: true, moradorDestino: true },
    });
    if (!encomenda) throw new NotFoundException(`Encomenda ${encomendaId} não encontrada`);

    const morador =
      encomenda.moradorDestino ??
      (await this.moradorRepo.findOne({
        where: {
          tenantId,
          apartamentoId: encomenda.apartamentoId,
          principal: true,
          ativo: true,
        },
      }));

    if (!morador) {
      this.logger.warn(`Encomenda ${encomendaId} sem morador destinatário identificável`);
      return;
    }
    if (!morador.telefoneE164) {
      this.logger.warn(`Morador ${morador.id} sem telefone — pulando notificação`);
      return;
    }
    if (!morador.receberWhatsapp) {
      this.logger.log(`Morador ${morador.id} optou por não receber WhatsApp`);
      return;
    }

    await this.whatsapp.sendTemplated({
      tenantId,
      encomendaId,
      moradorId: morador.id,
      to: morador.telefoneE164,
      templateKey: 'encomenda_chegou',
      variables: {
        nome: morador.nome.split(' ')[0],
        apartamento: encomenda.apartamento!.identificador,
        codigo: encomenda.codigoRetirada,
        condominio: encomenda.tenant!.nome,
      },
      idempotencyKey: `encomenda:${encomendaId}:notify`,
    });

    encomenda.status = 'notificado';
    encomenda.notificadaAt = new Date();
    await this.encomendaRepo.save(encomenda);
  }
}
