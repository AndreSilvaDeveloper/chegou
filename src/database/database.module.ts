import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import * as entities from './entities';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.getOrThrow<string>('DATABASE_URL'),
        // Schema é gerenciado pelas migrations SQL em db/migrations — NUNCA sync
        synchronize: false,
        migrationsRun: false,
        autoLoadEntities: false,
        entities: Object.values(entities),
        poolSize: config.get<number>('DATABASE_POOL_SIZE', 10),
        logging: config.get('NODE_ENV') === 'development' ? ['error', 'warn'] : ['error'],
      }),
    }),
  ],
})
export class DatabaseModule {}
