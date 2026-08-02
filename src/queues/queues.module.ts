import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';

export const QUEUE_NOTIFICATION_DISPATCH = 'notification-dispatch';

/**
 * Emissão de cobrança da assinatura.
 *
 * Fila própria, e não a de notificação, porque o ritmo das duas é oposto: a de
 * WhatsApp é deliberadamente lenta (regras anti-bloqueio, um envio por
 * condomínio de cada vez), e esta quer terminar o lote do dia 1º o quanto antes.
 * Compartilhar a fila faria a emissão herdar a lentidão que protege o WhatsApp.
 */
export const QUEUE_COBRANCA_EMISSAO = 'cobranca-emissao';

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          url: config.getOrThrow<string>('REDIS_URL'),
        },
        defaultJobOptions: {
          attempts: 5,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: { age: 24 * 3600, count: 1000 },
          removeOnFail: { age: 7 * 24 * 3600 },
        },
      }),
    }),
    BullModule.registerQueue({ name: QUEUE_NOTIFICATION_DISPATCH }),
    BullModule.registerQueue({ name: QUEUE_COBRANCA_EMISSAO }),
  ],
  exports: [BullModule],
})
export class QueuesModule {}
