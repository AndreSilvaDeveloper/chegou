import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from '../../database/entities';
import { TenantConfigService } from './tenant-config.service';

/** Global: o TenantModuleGuard roda como APP_GUARD e precisa do service. */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Tenant])],
  providers: [TenantConfigService],
  exports: [TenantConfigService],
})
export class TenantConfigModule {}
