import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from '../../database/entities';
import { OpenWaClient } from './openwa.client';
import { OpenwaConnectionController } from './openwa-connection.controller';
import { OpenwaConfigController } from './openwa-config.controller';
import { OpenwaWebhookController } from './openwa-webhook.controller';
import { OpenwaService } from './openwa.service';

/**
 * Integração com o gateway OpenWA (WhatsApp multi-sessão): 1 instância por condomínio.
 * Exporta o OpenwaService para o AdminModule provisionar a sessão na criação do tenant.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Tenant])],
  controllers: [OpenwaConnectionController, OpenwaConfigController, OpenwaWebhookController],
  providers: [OpenWaClient, OpenwaService],
  exports: [OpenwaService],
})
export class OpenwaModule {}
