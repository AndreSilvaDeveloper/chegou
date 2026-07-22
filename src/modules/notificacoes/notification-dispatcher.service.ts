import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NOTIFICATION_DISPATCH } from '../../queues/queues.module';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notificacao } from '../../database/entities';
import { StatusNotificacao } from '../../database/entities/notificacao.entity';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { NotificationThrottleService } from './notification-throttle.service';

@Processor(QUEUE_NOTIFICATION_DISPATCH, {
  concurrency: 1, // Garantir envio sequencial para respeitar throttle/anti-ban
})
export class NotificationDispatcherService extends WorkerHost {
  private readonly logger = new Logger(NotificationDispatcherService.name);

  constructor(
    @InjectRepository(Notificacao)
    private notificacaoRepo: Repository<Notificacao>,
    private whatsappService: WhatsappService,
    private throttleService: NotificationThrottleService,
  ) {
    super();
  }

  async process(job: Job<{ notificacaoId: string }>): Promise<any> {
    const { notificacaoId } = job.data;
    
    const notificacao = await this.notificacaoRepo.findOne({ where: { id: notificacaoId } });
    
    if (!notificacao || notificacao.status === StatusNotificacao.CANCELADA) {
      this.logger.debug(`Notificação ${notificacaoId} ignorada (não encontrada ou cancelada)`);
      return;
    }

    try {
      notificacao.status = StatusNotificacao.ENVIANDO;
      notificacao.tentativas += 1;
      await this.notificacaoRepo.save(notificacao);

      // 1. Aplica delay anti-ban
      await this.throttleService.waitForNextSlot();

      // 2. Envia WhatsApp
      const result = await this.whatsappService.sendTemplated({
        tenantId: notificacao.tenantId,
        to: notificacao.destinatarioTelefone,
        templateKey: (notificacao.referenciaTipo || 'aviso_geral') as any,
        variables: notificacao.variaveisJson as any,
        idempotencyKey: `notificacao:${notificacao.id}`,
      });

      // 3. Sucesso
      notificacao.status = StatusNotificacao.ENVIADA;
      notificacao.enviadaAt = new Date();
      notificacao.whatsappMessageId = result.id;
      await this.notificacaoRepo.save(notificacao);
      this.logger.log(`Notificação ${notificacaoId} enviada com sucesso`);
      
    } catch (error: any) {
      this.logger.error(`Erro ao enviar notificação ${notificacaoId}: ${error.message}`, error.stack);
      
      // Se for rate limit específico do provedor, podemos tratar
      if (error.response?.status === 429) {
        await this.throttleService.handleRateLimitError(error);
      }

      if (notificacao.tentativas >= notificacao.maxTentativas) {
        notificacao.status = StatusNotificacao.FALHA;
        notificacao.erroMensagem = error.message;
      } else {
        notificacao.status = StatusNotificacao.PENDENTE;
      }
      
      await this.notificacaoRepo.save(notificacao);
      
      throw error; // Repassa pro BullMQ fazer retry se ainda houver attempts
    }
  }
}
