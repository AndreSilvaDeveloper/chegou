import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notificacao } from '../../database/entities';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { NotificationService } from './notification.service';
import { NotificationThrottleService } from './notification-throttle.service';
import { NotificationDispatcherService } from './notification-dispatcher.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notificacao]),
    WhatsappModule,
  ],
  providers: [
    NotificationService,
    NotificationThrottleService,
    NotificationDispatcherService,
  ],
  exports: [NotificationService],
})
export class NotificacoesModule {}
