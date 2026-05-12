import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Apartamento, Morador } from '../../database/entities';
import { ApartamentosController } from './apartamentos.controller';
import { ApartamentosService } from './apartamentos.service';

@Module({
  imports: [TypeOrmModule.forFeature([Apartamento, Morador])],
  controllers: [ApartamentosController],
  providers: [ApartamentosService],
})
export class ApartamentosModule {}
