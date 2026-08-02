import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Administradora,
  Apartamento,
  AssinaturaClienteGateway,
  AssinaturaCondicao,
  AssinaturaWebhookEvento,
  AssinaturaPoliticaAcesso,
  AssinaturaCupomCliente,
  AssinaturaFaixa,
  AssinaturaFatura,
  AssinaturaFaturaItem,
  Tenant,
} from '../../database/entities';
import { AcessoAssinaturaService } from '../../common/guards';
import { PagamentosModule } from '../pagamentos/pagamentos.module';
import { AcessoAssinaturaImpl } from './acesso-assinatura.service';
import { PoliticaAcessoService } from './politica-acesso.service';
import { AdminAssinaturasController } from './admin-assinaturas.controller';
import { AssinaturaClientesService } from './assinatura-clientes.service';
import { AssinaturaCobrancasService } from './assinatura-cobrancas.service';
import { ConciliacaoService } from './conciliacao.service';
import { CupomFaturaService } from './cupom-fatura.service';
import { EmissaoCobrancaProcessor, FilaCobrancaService } from './fila-cobranca.service';
import { WebhookPagamentoService } from './webhook-pagamento.service';
import { WebhookPagamentosController } from './webhook-pagamentos.controller';
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
 * Cálculo, rotas do superadmin (`/admin/assinaturas`) e a visão do cliente — a
 * administradora em `/minha-administradora/assinatura` e o síndico em
 * `/assinatura`.
 *
 * O gateway de pagamento entra pelo `PagamentosModule`, e a divisão é essa:
 * **lá se sabe falar com a Payment API, aqui se sabe quem é o cliente e quanto
 * ele deve**. Ver `docs/plano-cobranca-gateway.md`.
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
      AssinaturaClienteGateway,
      AssinaturaWebhookEvento,
      AssinaturaPoliticaAcesso,
      AssinaturaCupomCliente,
    ]),
    PagamentosModule,
  ],
  controllers: [
    AdminAssinaturasController,
    MinhaAdministradoraAssinaturaController,
    AdministradoraCondominioAssinaturaController,
    AssinaturaCondominioController,
    WebhookPagamentosController,
  ],
  providers: [
    AssinaturasService,
    AssinaturaFaturasService,
    AssinaturaClientesService,
    AssinaturaCobrancasService,
    ConciliacaoService,
    WebhookPagamentoService,
    PoliticaAcessoService,
    CupomFaturaService,
    // O guard global (em `common/`) declara o contrato; quem sabe quem paga por
    // um condomínio é este módulo. É a inversão que impede `common` de depender
    // de um módulo de domínio.
    { provide: AcessoAssinaturaService, useClass: AcessoAssinaturaImpl },
    FilaCobrancaService,
    EmissaoCobrancaProcessor,
  ],
  exports: [
    AssinaturasService,
    AssinaturaFaturasService,
    AssinaturaClientesService,
    AssinaturaCobrancasService,
    ConciliacaoService,
    WebhookPagamentoService,
    // O guard global resolve por aqui (`ModuleRef`, `strict: false`).
    AcessoAssinaturaService,
  ],
})
export class AssinaturasModule {}
