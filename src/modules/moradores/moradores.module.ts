import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Apartamento, Morador } from '../../database/entities';
import { MoradoresController } from './moradores.controller';
import { MoradoresService } from './moradores.service';

@Module({
  imports: [TypeOrmModule.forFeature([Morador, Apartamento])],
  controllers: [MoradoresController],
  providers: [MoradoresService],
})
export class MoradoresModule {}
