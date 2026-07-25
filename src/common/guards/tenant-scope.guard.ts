import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '../../modules/auth/types';
import { TenantScopeService } from '../tenant-scope/tenant-scope.service';

/** Condomínio em que a administradora (ou o superadmin) quer operar. */
export const TENANT_HEADER = 'x-tenant-id';

export interface RequestComEscopo {
  user?: AuthenticatedUser;
  headers: Record<string, string | string[] | undefined>;
  /** Condomínio efetivo desta request — preenchido por este guard. */
  tenantScope?: string | null;
}

/**
 * Carimba em cada request o condomínio em que ela opera.
 *
 * Roda antes do TenantModuleGuard e é a única fonte de `@TenantId()`: nenhum
 * controller lê o header direto, então não há caminho para uma rota "esquecer"
 * de validar a carteira.
 */
@Injectable()
export class TenantScopeGuard implements CanActivate {
  constructor(private readonly scope: TenantScopeService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestComEscopo>();

    // Rota pública/sem JWT: não há escopo a resolver.
    if (!req.user) {
      req.tenantScope = null;
      return true;
    }

    const bruto = req.headers[TENANT_HEADER];
    const pedido = Array.isArray(bruto) ? bruto[0] : bruto;
    req.tenantScope = await this.scope.resolver(req.user, pedido);
    return true;
  }
}
