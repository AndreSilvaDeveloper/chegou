import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { Notificacao } from '../../database/entities';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { NotificationService } from './notification.service';
import { NotificationThrottleService } from './notification-throttle.service';
import { NotificationDispatcherService } from './notification-dispatcher.service';
import { NotificacoesController } from './notificacoes.controller';
import { QUEUE_NOTIFICATION_DISPATCH } from '../../queues/queues.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notificacao]),
    BullModule.registerQueue({
      name: QUEUE_NOTIFICATION_DISPATCH,
    }),
    WhatsappModule,
  ],
  controllers: [NotificacoesController],
  providers: [
    NotificationService,
    NotificationThrottleService,
    NotificationDispatcherService,
  ],
  exports: [NotificationService],
})
export class NotificacoesModule {}
