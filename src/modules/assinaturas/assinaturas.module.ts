import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Administradora,
  Apartamento,
  AssinaturaCondicao,
  AssinaturaFaixa,
  AssinaturaFatura,
  AssinaturaFaturaItem,
  Tenant,
} from '../../database/entities';
import { AdminAssinaturasController } from './admin-assinaturas.controller';
import {
  AdministradoraCondominioAssinaturaController,
  AssinaturaCondominioController,
  MinhaAdministradoraAssinaturaController,
} from './assinatura-cliente.controller';
import { AssinaturaFaturasService } from './assinatura-faturas.service';
import { AssinaturasService } from './assinaturas.service';

/**
 * Assinatura do Chegou (o que o cliente paga pelo sistema).
 *
 * Fase 3: cálculo, rotas do superadmin (`/admin/assinaturas`) e a visão do
 * cliente — a administradora em `/minha-administradora/assinatura` e o síndico
 * em `/assinatura`. Falta a fase 4: aviso de vencimento e gateway de pagamento.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Tenant,
      Administradora,
      Apartamento,
      AssinaturaFaixa,
      AssinaturaCondicao,
      AssinaturaFatura,
      AssinaturaFaturaItem,
    ]),
  ],
  controllers: [
    AdminAssinaturasController,
    MinhaAdministradoraAssinaturaController,
    AdministradoraCondominioAssinaturaController,
    AssinaturaCondominioController,
  ],
  providers: [AssinaturasService, AssinaturaFaturasService],
  exports: [AssinaturasService, AssinaturaFaturasService],
})
export class AssinaturasModule {}
