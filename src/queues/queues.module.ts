import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';

export const QUEUE_NOTIFY_MORADOR = 'notify-morador';
export const QUEUE_CONFIRMAR_RETIRADA = 'confirmar-retirada';

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
    BullModule.registerQueue(
      { name: QUEUE_NOTIFY_MORADOR },
      { name: QUEUE_CONFIRMAR_RETIRADA },
    ),
  ],
  exports: [BullModule],
})
export class QueuesModule {}
