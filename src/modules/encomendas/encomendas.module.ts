import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Apartamento, Encomenda, Morador, WhatsappMessage } from '../../database/entities';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { EncomendasController } from './encomendas.controller';
import { EncomendasService } from './encomendas.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Encomenda, Apartamento, Morador, WhatsappMessage]),
    WhatsappModule,
  ],
  controllers: [EncomendasController],
  providers: [EncomendasService],
})
export class EncomendasModule {}
