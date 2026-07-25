import { createParamDecorator, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { RequestComEscopo } from '../guards/tenant-scope.guard';

/**
 * Condomínio da request, já validado pelo TenantScopeGuard.
 *
 * Nunca lê o header nem o vínculo do usuário direto — o guard é quem decide,
 * então toda rota herda a mesma regra de isolamento.
 */
export const TenantId = createParamDecorator((_data: void, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest<RequestComEscopo>();
  const tenantId = req.tenantScope;
  if (tenantId) return tenantId;

  if (req.user?.role === 'admin') {
    throw new ForbiddenException(
      'Escolha o condomínio desta operação (header X-Tenant-Id) — ele precisa ser da sua carteira',
    );
  }
  throw new ForbiddenException('Esta operação requer um usuário vinculado a um condomínio');
});
