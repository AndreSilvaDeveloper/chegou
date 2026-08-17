import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from '../../database/entities';
import { CepController } from './cep.controller';
import { CepService } from './cep.service';
import { FilaGeocodificacaoService, GeocodificacaoProcessor } from './fila-geocodificacao.service';
import { GeocodingService } from './geocoding.service';

/**
 * CEP e coordenadas — os dois lados de "onde fica este endereço".
 *
 * A geocodificação mora aqui, e não num módulo próprio, porque ela **reaproveita
 * o `CepService`**: a coordenada do CEP é um dos passos da cadeia, e no fluxo
 * normal ela já está no cache da consulta que a tela acabou de fazer.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Tenant])],
  controllers: [CepController],
  providers: [CepService, GeocodingService, FilaGeocodificacaoService, GeocodificacaoProcessor],
  exports: [CepService, GeocodingService, FilaGeocodificacaoService],
})
export class CepModule {}
