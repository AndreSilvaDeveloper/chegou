import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notificacao, Tenant, User } from '../../database/entities';
import { ApartamentosModule } from '../apartamentos/apartamentos.module';
import { MoradoresModule } from '../moradores/moradores.module';
import { UsuariosModule } from '../usuarios/usuarios.module';
import { OpenwaModule } from '../openwa/openwa.module';
import { AdminTenantManagementController } from './admin-tenant-management.controller';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminWhatsappController } from './admin-whatsapp.controller';
import { AdminWhatsappService } from './admin-whatsapp.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Tenant, User, Notificacao]),
    UsuariosModule,
    MoradoresModule,
    ApartamentosModule,
    OpenwaModule,
  ],
  controllers: [AdminController, AdminTenantManagementController, AdminWhatsappController],
  providers: [AdminService, AdminWhatsappService],
})
export class AdminModule {}
