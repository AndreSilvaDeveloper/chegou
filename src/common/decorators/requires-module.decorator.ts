import { SetMetadata } from '@nestjs/common';

export const REQUIRES_MODULE_KEY = 'requiresModule';

/**
 * Módulos opcionais do condomínio, ligados/desligados pelo superadmin em
 * `tenants.config_json`. Rotas marcadas com @RequiresModule só respondem
 * quando a flag correspondente está ativa (ver TenantModuleGuard).
 */
export type TenantModule = 'vagas' | 'avisos';

export const RequiresModule = (modulo: TenantModule) =>
  SetMetadata(REQUIRES_MODULE_KEY, modulo);
