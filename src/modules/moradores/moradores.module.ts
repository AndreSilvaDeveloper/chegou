import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Apartamento, Morador, Tenant } from '../../database/entities';
import { AutocadastroLinkController, PublicAutocadastroController } from './autocadastro.controller';
import { AutocadastroService } from './autocadastro.service';
import { MoradoresController } from './moradores.controller';
import { MoradoresService } from './moradores.service';

@Module({
  imports: [TypeOrmModule.forFeature([Morador, Apartamento, Tenant])],
  // AutocadastroLinkController vem ANTES do MoradoresController de propósito:
  // `GET /moradores/autocadastro-link` colidiria com o `GET /moradores/:id`
  // (ParseUUIDPipe → 400). O Express casa na ordem de registro, então a rota
  // estática precisa ser registrada primeiro para vencer a paramétrica.
  controllers: [PublicAutocadastroController, AutocadastroLinkController, MoradoresController],
  providers: [MoradoresService, AutocadastroService],
  exports: [MoradoresService],
})
export class MoradoresModule {}
