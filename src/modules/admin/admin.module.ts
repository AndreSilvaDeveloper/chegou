import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant, User } from '../../database/entities';
import { ApartamentosModule } from '../apartamentos/apartamentos.module';
import { MoradoresModule } from '../moradores/moradores.module';
import { UsuariosModule } from '../usuarios/usuarios.module';
import { AdminTenantManagementController } from './admin-tenant-management.controller';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Tenant, User]),
    UsuariosModule,
    MoradoresModule,
    ApartamentosModule,
  ],
  controllers: [AdminController, AdminTenantManagementController],
  providers: [AdminService],
})
export class AdminModule {}
