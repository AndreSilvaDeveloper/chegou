import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from '../../database/entities';
import { AdminTenantWhatsappController } from './admin-tenant-whatsapp.controller';
import { OpenWaClient } from './openwa.client';
import { OpenwaConnectionController } from './openwa-connection.controller';
import { OpenwaConfigController } from './openwa-config.controller';
import { OpenwaService } from './openwa.service';

/**
 * Integração com o gateway OpenWA (WhatsApp multi-sessão): 1 instância por condomínio.
 * Exporta o OpenwaService para o AdminModule provisionar a sessão na criação do tenant.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Tenant])],
  controllers: [
    OpenwaConnectionController,
    OpenwaConfigController,
    // O mesmo WhatsApp, operado pela plataforma com o condomínio no path.
    AdminTenantWhatsappController,
  ],
  providers: [OpenWaClient, OpenwaService],
  exports: [OpenwaService],
})
export class OpenwaModule {}
