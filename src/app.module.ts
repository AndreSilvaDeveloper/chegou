import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard, RolesGuard } from './common/guards';
import { envValidationSchema } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { QueuesModule } from './queues/queues.module';
import { AdminModule } from './modules/admin/admin.module';
import { ApartamentosModule } from './modules/apartamentos/apartamentos.module';
import { AuthModule } from './modules/auth/auth.module';
import { EncomendasModule } from './modules/encomendas/encomendas.module';
import { HealthModule } from './modules/health/health.module';
import { MoradoresModule } from './modules/moradores/moradores.module';
import { StorageModule } from './modules/storage/storage.module';
import { UsuariosModule } from './modules/usuarios/usuarios.module';
import { WhatsappModule } from './modules/whatsapp/whatsapp.module';
import { VagasModule } from './modules/vagas/vagas.module';
import { EquipeModule } from './modules/equipe/equipe.module';
import { NotificacoesModule } from './modules/notificacoes/notificacoes.module';
import { AvisosModule } from './modules/avisos/avisos.module';
import { AuditModule } from './common/audit/audit.module';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

@Module({
  imports: [
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 100, // 100 requests per 60 seconds by default
    }]),
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validationSchema: envValidationSchema,
      validationOptions: { abortEarly: true, allowUnknown: true },
    }),
    DatabaseModule,
    QueuesModule,
    AuthModule,
    HealthModule,
    WhatsappModule,
    ApartamentosModule,
    MoradoresModule,
    UsuariosModule,
    EncomendasModule,
    StorageModule,
    AdminModule,
    VagasModule,
    EquipeModule,
    NotificacoesModule,
    AvisosModule,
    AuditModule,
  ],
  providers: [
    // Auth aplicado globalmente — rotas exigem JWT por padrão; use @Public() pra excecionar
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
