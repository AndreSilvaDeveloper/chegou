import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import {
  AcessoAssinaturaGuard,
  JwtAuthGuard,
  RolesGuard,
  TenantModuleGuard,
  TenantScopeGuard,
} from './common/guards';
import { envValidationSchema } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { QueuesModule } from './queues/queues.module';
import { AdminModule } from './modules/admin/admin.module';
import { AdministradorasModule } from './modules/administradoras/administradoras.module';
import { MeuCondominioModule } from './modules/condominio/meu-condominio.module';
import { ApartamentosModule } from './modules/apartamentos/apartamentos.module';
import { AuthModule } from './modules/auth/auth.module';
import { EncomendasModule } from './modules/encomendas/encomendas.module';
import { EtiquetasModule } from './modules/etiquetas/etiquetas.module';
import { HealthModule } from './modules/health/health.module';
import { MoradoresModule } from './modules/moradores/moradores.module';
import { StorageModule } from './modules/storage/storage.module';
import { UsuariosModule } from './modules/usuarios/usuarios.module';
import { WhatsappModule } from './modules/whatsapp/whatsapp.module';
import { OpenwaModule } from './modules/openwa/openwa.module';
import { VagasModule } from './modules/vagas/vagas.module';
import { EquipeModule } from './modules/equipe/equipe.module';
import { NotificacoesModule } from './modules/notificacoes/notificacoes.module';
import { AvisosModule } from './modules/avisos/avisos.module';
import { AssinaturasModule } from './modules/assinaturas/assinaturas.module';
import { RelatoriosModule } from './modules/relatorios/relatorios.module';
import { AuditModule } from './common/audit/audit.module';
import { RedisModule } from './common/redis/redis.module';
import { TenantConfigModule } from './common/tenant-config/tenant-config.module';
import { TenantScopeModule } from './common/tenant-scope/tenant-scope.module';
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
    RedisModule,
    QueuesModule,
    AuthModule,
    HealthModule,
    WhatsappModule,
    OpenwaModule,
    ApartamentosModule,
    MoradoresModule,
    UsuariosModule,
    EncomendasModule,
    EtiquetasModule,
    StorageModule,
    AdminModule,
    AdministradorasModule,
    MeuCondominioModule,
    VagasModule,
    EquipeModule,
    NotificacoesModule,
    AvisosModule,
    AssinaturasModule,
    RelatoriosModule,
    AuditModule,
    TenantConfigModule,
    TenantScopeModule,
  ],
  providers: [
    // Auth aplicado globalmente — rotas exigem JWT por padrão; use @Public() pra excecionar
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    // Resolve e valida o condomínio da request (X-Tenant-Id) — precisa vir
    // antes de qualquer guard ou rota que dependa do escopo.
    { provide: APP_GUARD, useClass: TenantScopeGuard },
    // Depois do escopo: bloqueia módulos opcionais não contratados (@RequiresModule)
    { provide: APP_GUARD, useClass: TenantModuleGuard },
    // Depois do escopo também: 402 na ESCRITA para quem está com a assinatura
    // em atraso. Leitura nunca é bloqueada, e toda dúvida libera (fail-open).
    // Nasce inerte: só age com PAYMENT_BLOQUEIO_ATIVO=true.
    { provide: APP_GUARD, useClass: AcessoAssinaturaGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
