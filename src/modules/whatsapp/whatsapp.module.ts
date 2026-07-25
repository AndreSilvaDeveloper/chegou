import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Encomenda, Morador, WhatsappMessage } from '../../database/entities';
import { OpenwaModule } from '../openwa/openwa.module';
import { OpenwaWebhookController } from './webhook-openwa.controller';
import { WhatsappService } from './whatsapp.service';

/**
 * Histórico de mensagens e resposta automática ao morador.
 *
 * Não há mais adapter de provedor: o envio é do OpenWA (gateway próprio, uma
 * sessão por condomínio) e o disparo em massa passa pela fila de notificações.
 *
 * O webhook do OpenWA mora AQUI, e não no módulo dele, para a dependência ter
 * um sentido só: whatsapp → openwa. Ao contrário, os dois se importariam.
 */
@Module({
  imports: [TypeOrmModule.forFeature([WhatsappMessage, Encomenda, Morador]), OpenwaModule],
  controllers: [OpenwaWebhookController],
  providers: [WhatsappService],
  exports: [WhatsappService],
})
export class WhatsappModule {}
