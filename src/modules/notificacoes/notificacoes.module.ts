import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { Encomenda, Notificacao, Tenant } from '../../database/entities';
import { OpenwaModule } from '../openwa/openwa.module';
import { NotificationService } from './notification.service';
import { DispatchSchedulerService } from './dispatch-scheduler.service';
import { NotificationDispatcherService } from './notification-dispatcher.service';
import { NotificacoesController } from './notificacoes.controller';
import { QUEUE_NOTIFICATION_DISPATCH } from '../../queues/queues.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notificacao, Tenant, Encomenda]),
    BullModule.registerQueue({
      name: QUEUE_NOTIFICATION_DISPATCH,
    }),
    OpenwaModule,
  ],
  controllers: [NotificacoesController],
  providers: [
    NotificationService,
    DispatchSchedulerService,
    NotificationDispatcherService,
  ],
  exports: [NotificationService],
})
export class NotificacoesModule {}
