import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { RequestComEscopo } from '../guards/tenant-scope.guard';

/**
 * Condomínio da request, ou `null` quando não há um.
 *
 * Use quando a rota funciona com e sem condomínio (ex.: `/auth/me`). Para rota
 * que exige condomínio, use `@TenantId()`, que recusa a request sem escopo.
 */
export const TenantScope = createParamDecorator(
  (_data: void, ctx: ExecutionContext): string | null => {
    const req = ctx.switchToHttp().getRequest<RequestComEscopo>();
    return req.tenantScope ?? null;
  },
);
