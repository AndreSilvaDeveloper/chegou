import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditService } from '../audit/audit.service';
import { Request } from 'express';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const req = ctx.getRequest<Request & { user?: any }>();
    const { method, url, ip, headers, body, params } = req;
    
    // Filtra métodos que modificam estado
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      return next.handle();
    }

    // Tenta inferir entidade e ação pela URL (ex: /api/encomendas/:id -> entity=encomenda, action=update)
    const urlParts = url.split('/').filter(p => p && p !== 'api');
    const entity = urlParts[0] || 'unknown'; // Pega o primeiro segmento (ex: encomendas)
    let action = 'unknown';

    if (method === 'POST') action = 'create';
    if (method === 'PUT' || method === 'PATCH') action = 'update';
    if (method === 'DELETE') action = 'delete';

    const userAgent = headers['user-agent'] as string;
    const userId = req.user?.id || null;
    const tenantId = req.user?.tenantId || null;

    // A resposta
    return next.handle().pipe(
      tap((responseBody) => {
        // Tenta pegar o ID da entidade (do param na rota, ou do corpo de retorno se for POST)
        let entityId = params.id;
        if (method === 'POST' && responseBody && responseBody.id) {
          entityId = responseBody.id;
        }

        // Tenta sanitizar senhas ou tokens
        const diff = { ...body };
        if (diff.senha) diff.senha = '***';
        if (diff.password) diff.password = '***';

        // Registra de forma assíncrona
        this.auditService.log({
          tenantId,
          userId,
          entity,
          entityId: entityId || null,
          action,
          diffJson: diff,
          ipAddress: ip,
          userAgent,
        });
      }),
    );
  }
}
