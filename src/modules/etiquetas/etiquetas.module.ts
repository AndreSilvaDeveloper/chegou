import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EtiquetaAmostra } from '../../database/entities';
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
    TypeOrmModule.forFeature([EtiquetaAmostra]),
    StorageModule,
    ApartamentosModule,
    MoradoresModule,
  ],
  controllers: [EtiquetasController, AdminEtiquetasController],
  providers: [AdminEtiquetasService, LeituraEtiquetaService, OcrService],
  exports: [OcrService],
})
export class EtiquetasModule {}
