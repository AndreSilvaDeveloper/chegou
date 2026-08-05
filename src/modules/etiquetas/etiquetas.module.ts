import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EtiquetaAmostra, Tenant } from '../../database/entities';
import { ApartamentosModule } from '../apartamentos/apartamentos.module';
import { MoradoresModule } from '../moradores/moradores.module';
import { StorageModule } from '../storage/storage.module';
import { AdminEtiquetasController } from './admin-etiquetas.controller';
import { AdminEtiquetasService } from './admin-etiquetas.service';
import { EtiquetasController } from './etiquetas.controller';
import { LeituraEtiquetaService } from './leitura.service';
import { OcrService } from './ocr.service';

/**
 * Leitura de etiqueta de entrega.
 *
 * Dois consumidores do mesmo parser: a portaria (`EtiquetasController`, que
 * preenche a encomenda) e o banco de amostras do superadmin
 * (`AdminEtiquetasController`, que mede o quanto o parser acerta).
 *
 * O de-para com o cadastro reaproveita `ApartamentosService` e
 * `MoradoresService` — as regras de unidade e morador continuam nos donos delas.
 */
@Module({
  imports: [
    // `Tenant` entra porque a leitura ancora a zona de destino no endereço
    // cadastrado do condomínio (ver `leitura.service.ts`).
    TypeOrmModule.forFeature([EtiquetaAmostra, Tenant]),
    StorageModule,
    ApartamentosModule,
    MoradoresModule,
  ],
  controllers: [EtiquetasController, AdminEtiquetasController],
  providers: [AdminEtiquetasService, LeituraEtiquetaService, OcrService],
  exports: [OcrService],
})
export class EtiquetasModule {}
