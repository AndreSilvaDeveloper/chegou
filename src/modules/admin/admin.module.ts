import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notificacao, Tenant, User } from '../../database/entities';
import { ApartamentosModule } from '../apartamentos/apartamentos.module';
import { MoradoresModule } from '../moradores/moradores.module';
import { UsuariosModule } from '../usuarios/usuarios.module';
import { OpenwaModule } from '../openwa/openwa.module';
import { AssinaturasModule } from '../assinaturas/assinaturas.module';
import { MeuCondominioModule } from '../condominio/meu-condominio.module';
import { AdminTenantManagementController } from './admin-tenant-management.controller';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { CepModule } from '../cep/cep.module';

/**
 * O WhatsApp por condomínio **não** mora aqui: ele é
 * `AdminTenantWhatsappController`, no módulo OpenWA, junto do serviço que opera
 * a sessão. A visão consolidada de `/admin/whatsapp` deixou de existir quando o
 * assunto virou uma aba de cada condomínio.
 */
@Module({
  imports: [CepModule, 
    TypeOrmModule.forFeature([Tenant, User, Notificacao]),
    UsuariosModule,
    MoradoresModule,
    ApartamentosModule,
    OpenwaModule,
    // O condomínio em números, na tela do condomínio: os mesmos serviços que a
    // administradora usa na carteira. Uma fonte só para o mesmo número.
    MeuCondominioModule,
    AssinaturasModule,
  ],
  controllers: [AdminController, AdminTenantManagementController],
  providers: [AdminService],
  // O módulo de administradoras reaproveita a criação de condomínio.
  exports: [AdminService],
})
export class AdminModule {}
