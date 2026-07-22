import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Aviso, Morador } from '../../database/entities';
import { AvisosController } from './avisos.controller';
import { AvisosService } from './avisos.service';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Aviso, Morador]),
    NotificacoesModule,
  ],
  controllers: [AvisosController],
  providers: [AvisosService],
  exports: [AvisosService],
})
export class AvisosModule {}
