import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Administradora, Tenant, User } from '../../database/entities';
import { AdminModule } from '../admin/admin.module';
import { AssinaturasModule } from '../assinaturas/assinaturas.module';
import { MeuCondominioModule } from '../condominio/meu-condominio.module';
import { AdministradorasService } from './administradoras.service';
import { AdminAdministradorasController } from './admin-administradoras.controller';
import { MinhaAdministradoraController } from './minha-administradora.controller';
import { CepModule } from '../cep/cep.module';

@Module({
  imports: [
    CepModule,
    TypeOrmModule.forFeature([Administradora, Tenant, User]),
    AdminModule,
    // Os números do condomínio (`ResumoCondominioService`) e a conta da
    // carteira (`AssinaturaFaturasService`) — a tela da carteira mostra os dois
    // lado a lado, e nenhum dos dois é conhecimento desta pasta.
    MeuCondominioModule,
    AssinaturasModule,
  ],
  controllers: [AdminAdministradorasController, MinhaAdministradoraController],
  providers: [AdministradorasService],
  exports: [AdministradorasService],
})
export class AdministradorasModule {}
