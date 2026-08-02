import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AssinaturaClienteGateway } from '../../database/entities';
import { AcessoService } from './acesso.service';
import { ClientesGatewayService } from './clientes-gateway.service';
import { CobrancasService } from './cobrancas.service';
import { CuponsService } from './cupons.service';
import { PaymentApiClient } from './payment-api.client';

/**
 * Pagamentos: tudo que conversa com a Payment API.
 *
 * Não tem controller próprio de propósito. As rotas de cobrança são do
 * superadmin e vivem em `/admin/assinaturas/...`, no módulo Assinaturas — é lá
 * que se sabe quem é o sacado de um condomínio. Aqui ficam as peças que aquele
 * módulo injeta.
 *
 * (O webhook da fase 4 será a exceção: ele é público e não tem dono do outro
 * lado, então nasce com controller aqui.)
 */
@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([AssinaturaClienteGateway])],
  providers: [PaymentApiClient, ClientesGatewayService, CobrancasService, AcessoService, CuponsService],
  exports: [PaymentApiClient, ClientesGatewayService, CobrancasService, AcessoService, CuponsService],
})
export class PagamentosModule {}
