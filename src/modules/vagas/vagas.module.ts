import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Vaga, VagaLocacao } from '../../database/entities';
import { VagasController } from './vagas.controller';
import { VagasService } from './vagas.service';

import { VagasLocacaoController } from './vagas-locacao.controller';
import { VagasLocacaoService } from './vagas-locacao.service';

@Module({
  imports: [TypeOrmModule.forFeature([Vaga, VagaLocacao])],
  controllers: [VagasController, VagasLocacaoController],
  providers: [VagasService, VagasLocacaoService],
  exports: [VagasService, VagasLocacaoService],
})
export class VagasModule {}
