import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from '../../database/entities';
import { TenantModule } from '../decorators/requires-module.decorator';

/** Chave em `tenants.config_json` que liga cada módulo opcional. */
const MODULE_CONFIG_KEY: Record<TenantModule, string> = {
  vagas: 'moduloVagas',
  avisos: 'moduloAvisos',
};

/**
 * Leitura do `config_json` do condomínio com cache curto em memória.
 *
 * O TenantModuleGuard consulta isso em toda request de módulo opcional — sem
 * cache seria um SELECT extra por chamada. O TTL é curto e `invalidate()` é
 * chamado quando o superadmin salva a configuração, então o efeito de ligar ou
 * desligar um módulo é imediato.
 */
@Injectable()
export class TenantConfigService {
  private static readonly TTL_MS = 30_000;

  private readonly cache = new Map<string, { config: Record<string, unknown>; expiraEm: number }>();

  constructor(@InjectRepository(Tenant) private readonly repo: Repository<Tenant>) {}

  async get(tenantId: string): Promise<Record<string, unknown>> {
    const agora = Date.now();
    const hit = this.cache.get(tenantId);
    if (hit && hit.expiraEm > agora) return hit.config;

    const tenant = await this.repo.findOne({
      where: { id: tenantId },
      select: { id: true, configJson: true },
    });
    const config = tenant?.configJson ?? {};
    this.cache.set(tenantId, { config, expiraEm: agora + TenantConfigService.TTL_MS });
    return config;
  }

  async isModuleEnabled(tenantId: string, modulo: TenantModule): Promise<boolean> {
    const config = await this.get(tenantId);
    return config[MODULE_CONFIG_KEY[modulo]] === true;
  }

  invalidate(tenantId: string): void {
    this.cache.delete(tenantId);
  }
}
