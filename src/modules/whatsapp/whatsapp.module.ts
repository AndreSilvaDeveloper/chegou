import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Encomenda, Morador, WhatsappMessage } from '../../database/entities';
import { TwilioAdapter } from './gateway/twilio.adapter';
import { WhatsappProvider } from './gateway/types';
import { WHATSAPP_GATEWAY, WhatsappGateway } from './gateway/whatsapp.gateway';
import { ZApiAdapter } from './gateway/zapi.adapter';
import { SmsGateway } from './gateway/sms.gateway';
import { ConfirmarRetiradaProcessor } from './processors/confirmar-retirada.processor';
import { NotifyMoradorProcessor } from './processors/notify-morador.processor';
import { WhatsappWebhookController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';

const gatewayFactory = (config: ConfigService): WhatsappGateway => {
  const provider = config.getOrThrow<WhatsappProvider>('WHATSAPP_PROVIDER');
  switch (provider) {
    case 'twilio':
      return new TwilioAdapter(config);
    case 'zapi':
      return new ZApiAdapter();
    default:
      throw new Error(`Provider WhatsApp não suportado: ${provider}`);
  }
};

@Module({
  imports: [TypeOrmModule.forFeature([WhatsappMessage, Encomenda, Morador])],
  controllers: [WhatsappWebhookController],
  providers: [
    {
      provide: WHATSAPP_GATEWAY,
      useFactory: gatewayFactory,
      inject: [ConfigService],
    },
    WhatsappService,
    SmsGateway,
    NotifyMoradorProcessor,
    ConfirmarRetiradaProcessor,
  ],
  exports: [WhatsappService],
})
export class WhatsappModule {}
