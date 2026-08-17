import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Administradora, Tenant, User } from '../../database/entities';
import { AdminModule } from '../admin/admin.module';
import { AdministradorasService } from './administradoras.service';
import { AdminAdministradorasController } from './admin-administradoras.controller';
import { MinhaAdministradoraController } from './minha-administradora.controller';
import { CepModule } from '../cep/cep.module';

@Module({
  imports: [CepModule, TypeOrmModule.forFeature([Administradora, Tenant, User]), AdminModule],
  controllers: [AdminAdministradorasController, MinhaAdministradoraController],
  providers: [AdministradorasService],
  exports: [AdministradorasService],
})
export class AdministradorasModule {}
