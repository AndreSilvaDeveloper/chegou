import { createParamDecorator, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AuthenticatedUser } from '../../modules/auth/types';

export const TenantId = createParamDecorator((_data: void, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
  const tenantId = req.user?.tenantId;
  if (!tenantId) {
    throw new ForbiddenException('Esta operação requer um usuário vinculado a um condomínio');
  }
  return tenantId;
});
