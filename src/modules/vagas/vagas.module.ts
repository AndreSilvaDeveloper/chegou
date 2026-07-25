import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Apartamento,
  Morador,
  Tenant,
  Vaga,
  VagaCobranca,
  VagaLocacao,
  VagaPreco,
} from '../../database/entities';
import { VagasController } from './vagas.controller';
import { VagasService } from './vagas.service';

import { VagasLocacaoController } from './vagas-locacao.controller';
import { VagasLocacaoService } from './vagas-locacao.service';

import { VagasPrecosController } from './vagas-precos.controller';
import { VagasPrecosService } from './vagas-precos.service';

import { VagasCobrancasController } from './vagas-cobrancas.controller';
import { VagasCobrancasService } from './vagas-cobrancas.service';

import { StorageModule } from '../storage/storage.module';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { COBRANCA_GATEWAY } from './gateway/cobranca.gateway';
import { ManualCobrancaAdapter } from './gateway/manual.adapter';
import { AsaasCobrancaAdapter } from './gateway/asaas.adapter';
import { EMAIL_GATEWAY, NoopEmailAdapter } from './gateway/email.gateway';

@Module({
  imports: [
    // Apartamento, Morador e Tenant entram só para validações e para montar a
    // mensagem de cobrança.
    TypeOrmModule.forFeature([
      Vaga,
      VagaLocacao,
      VagaPreco,
      VagaCobranca,
      Apartamento,
      Morador,
      Tenant,
    ]),
    StorageModule,
    NotificacoesModule,
  ],
  controllers: [
    VagasController,
    VagasLocacaoController,
    VagasPrecosController,
    VagasCobrancasController,
  ],
  providers: [
    VagasService,
    VagasLocacaoService,
    VagasPrecosService,
    VagasCobrancasService,
    ManualCobrancaAdapter,
    AsaasCobrancaAdapter,
    {
      // COBRANCA_PROVIDER=asaas já resolve para o adapter certo, mas ele ainda
      // lança NotImplemented — a troca é só de configuração quando a integração
      // for escrita.
      provide: COBRANCA_GATEWAY,
      inject: [ConfigService, ManualCobrancaAdapter, AsaasCobrancaAdapter],
      useFactory: (
        config: ConfigService,
        manual: ManualCobrancaAdapter,
        asaas: AsaasCobrancaAdapter,
      ) => (config.get<string>('COBRANCA_PROVIDER') === 'asaas' ? asaas : manual),
    },
    { provide: EMAIL_GATEWAY, useClass: NoopEmailAdapter },
  ],
  exports: [VagasService, VagasLocacaoService, VagasPrecosService, VagasCobrancasService],
})
export class VagasModule {}
