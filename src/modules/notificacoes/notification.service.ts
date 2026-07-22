import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Notificacao } from '../../database/entities';
import { StatusNotificacao } from '../../database/entities/notificacao.entity';
import { QUEUE_NOTIFICATION_DISPATCH } from '../../queues/queues.module';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectRepository(Notificacao)
    private readonly notificacaoRepo: Repository<Notificacao>,
    @InjectQueue(QUEUE_NOTIFICATION_DISPATCH)
    private readonly dispatchQueue: Queue,
  ) {}

  async agendarNotificacao(params: Partial<Notificacao>) {
    const notificacao = this.notificacaoRepo.create({
      ...params,
      status: params.agendadaPara ? StatusNotificacao.AGENDADA : StatusNotificacao.PENDENTE,
    });
    
    await this.notificacaoRepo.save(notificacao);

    // Adiciona na fila do BullMQ
    const delay = params.agendadaPara ? Math.max(0, params.agendadaPara.getTime() - Date.now()) : 0;
    
    await this.dispatchQueue.add(
      'dispatch',
      { notificacaoId: notificacao.id },
      { 
        delay,
        priority: notificacao.prioridade || 5, // BullMQ: lower number = higher priority
      }
    );

    this.logger.log(`Notificação ${notificacao.id} enfileirada (Delay: ${delay}ms)`);
    return notificacao;
  }
}
