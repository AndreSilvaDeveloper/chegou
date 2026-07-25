import { createParamDecorator, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AuthenticatedUser } from '../../modules/auth/types';

/**
 * Carteira do usuário logado. Só a administradora (`admin`) tem uma, então a
 * rota que usa este decorator já está restrita a ela por construção.
 */
export const AdministradoraId = createParamDecorator(
  (_data: void, ctx: ExecutionContext): string => {
    const req = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const administradoraId = req.user?.administradoraId;
    if (!administradoraId) {
      throw new ForbiddenException('Esta operação requer um usuário de administradora');
    }
    return administradoraId;
  },
);
