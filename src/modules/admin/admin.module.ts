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

/**
 * O WhatsApp por condomínio **não** mora aqui: ele é
 * `AdminTenantWhatsappController`, no módulo OpenWA, junto do serviço que opera
 * a sessão. A visão consolidada de `/admin/whatsapp` deixou de existir quando o
 * assunto virou uma aba de cada condomínio.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Tenant, User, Notificacao]),
    UsuariosModule,
    MoradoresModule,
    ApartamentosModule,
    OpenwaModule,
  ],
  controllers: [AdminController, AdminTenantManagementController],
  providers: [AdminService],
  // O módulo de administradoras reaproveita a criação de condomínio.
  exports: [AdminService],
})
export class AdminModule {}
