import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from '../../database/entities';
import { MeuCondominioController } from './meu-condominio.controller';
import { MeuCondominioService } from './meu-condominio.service';

@Module({
  imports: [TypeOrmModule.forFeature([Tenant])],
  controllers: [MeuCondominioController],
  providers: [MeuCondominioService],
})
export class MeuCondominioModule {}
