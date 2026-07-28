import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EtiquetaAmostra } from '../../database/entities';
import { StorageModule } from '../storage/storage.module';
import { AdminEtiquetasController } from './admin-etiquetas.controller';
import { AdminEtiquetasService } from './admin-etiquetas.service';
import { OcrService } from './ocr.service';

/**
 * Leitura de etiqueta de entrega.
 *
 * Hoje só o banco de amostras do superadmin, que é o que calibra o parser. O
 * `OcrService` já sai exportado porque a leitura na portaria (porteiro e
 * síndico) é o próximo passo e vai consumir o mesmo cliente.
 */
@Module({
  imports: [TypeOrmModule.forFeature([EtiquetaAmostra]), StorageModule],
  controllers: [AdminEtiquetasController],
  providers: [AdminEtiquetasService, OcrService],
  exports: [OcrService],
})
export class EtiquetasModule {}
