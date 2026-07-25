import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Apartamento, Encomenda, Morador, Tenant, WhatsappMessage } from '../../database/entities';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { EncomendasController } from './encomendas.controller';
import { EncomendasService } from './encomendas.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Encomenda, Apartamento, Morador, WhatsappMessage, Tenant]),
    NotificacoesModule,
  ],
  controllers: [EncomendasController],
  providers: [EncomendasService],
})
export class EncomendasModule {}
