import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/** Token de injeção do cliente Redis compartilhado. */
export const REDIS_CLIENT = 'REDIS_CLIENT';

/**
 * Uma conexão Redis para o app inteiro (fora as do BullMQ, que são dele).
 *
 * Antes cada serviço abria a sua — três conexões fazendo o mesmo trabalho, e
 * cada nova peça que precisasse de Redis abriria a quarta. Com o disparo
 * concorrente, o que passa por aqui (slot de envio, cota diária, trava por
 * condomínio, cache de JID) é justamente o que precisa estar na **mesma**
 * conexão para os scripts Lua serem baratos.
 *
 * `maxRetriesPerRequest: null` porque comando que falha durante um blip de rede
 * deve esperar a reconexão, não estourar erro no meio de um envio.
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Redis(config.getOrThrow<string>('REDIS_URL'), { maxRetriesPerRequest: null }),
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }
}
