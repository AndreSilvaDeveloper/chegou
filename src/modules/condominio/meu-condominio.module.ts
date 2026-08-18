import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from '../../database/entities';
import { MeuCondominioController } from './meu-condominio.controller';
import { MeuCondominioService } from './meu-condominio.service';
import { ResumoCondominioService } from './resumo-condominio.service';
import { CepModule } from '../cep/cep.module';

/**
 * O `ResumoCondominioService` é exportado porque quem vê o condomínio **de
 * fora** também precisa dos mesmos números: a administradora, na carteira, e o
 * superadmin, na tela do condomínio. Ter uma fonte só é o que impede as três
 * telas de divergirem sobre "quantas unidades este condomínio tem".
 */
@Module({
  imports: [CepModule, TypeOrmModule.forFeature([Tenant])],
  controllers: [MeuCondominioController],
  providers: [MeuCondominioService, ResumoCondominioService],
  exports: [ResumoCondominioService],
})
export class MeuCondominioModule {}
