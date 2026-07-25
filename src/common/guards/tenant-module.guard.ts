import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRES_MODULE_KEY, TenantModule } from '../decorators/requires-module.decorator';
import { TenantConfigService } from '../tenant-config/tenant-config.service';
import { RequestComEscopo } from './tenant-scope.guard';

/** Rótulo do módulo na mensagem de erro — o front mostra isso ao usuário. */
const MODULE_LABEL: Record<TenantModule, string> = {
  vagas: 'Vagas de garagem',
  avisos: 'Mural de avisos',
};

/**
 * Bloqueia rotas de módulos opcionais que o condomínio não contratou.
 *
 * Roda depois do RolesGuard: quem chega aqui já está autenticado e com role
 * permitida. Sem @RequiresModule na rota, não faz nada.
 */
@Injectable()
export class TenantModuleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenantConfig: TenantConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const modulo = this.reflector.getAllAndOverride<TenantModule>(REQUIRES_MODULE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!modulo) return true;

    // Escopo já resolvido pelo TenantScopeGuard: para a administradora é o
    // condomínio escolhido no header, não um vínculo fixo.
    const req = context.switchToHttp().getRequest<RequestComEscopo>();
    const tenantId = req.tenantScope;

    // Sem condomínio na request não há config_json para consultar — módulos
    // opcionais são sempre por condomínio.
    if (!tenantId) {
      throw new ForbiddenException(`Módulo "${MODULE_LABEL[modulo]}" não se aplica a este usuário`);
    }

    if (!(await this.tenantConfig.isModuleEnabled(tenantId, modulo))) {
      throw new ForbiddenException(
        `Módulo "${MODULE_LABEL[modulo]}" não está habilitado para este condomínio`,
      );
    }
    return true;
  }
}
