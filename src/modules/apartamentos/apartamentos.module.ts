import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Apartamento, Morador } from '../../database/entities';
import { VagasModule } from '../vagas/vagas.module';
import { ApartamentosController } from './apartamentos.controller';
import { ApartamentosService } from './apartamentos.service';

@Module({
  // VagasModule: o vínculo vaga↔apartamento é operado por aqui, mas as regras
  // ficam no módulo dono delas (VagasService).
  imports: [TypeOrmModule.forFeature([Apartamento, Morador]), VagasModule],
  controllers: [ApartamentosController],
  providers: [ApartamentosService],
  exports: [ApartamentosService],
})
export class ApartamentosModule {}
