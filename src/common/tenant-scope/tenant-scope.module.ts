import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from '../../database/entities';
import { TenantScopeService } from './tenant-scope.service';

/** Global: o TenantScopeGuard roda como APP_GUARD e precisa do service. */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Tenant])],
  providers: [TenantScopeService],
  exports: [TenantScopeService],
})
export class TenantScopeModule {}
