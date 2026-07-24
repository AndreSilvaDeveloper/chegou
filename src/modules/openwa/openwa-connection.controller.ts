import { Controller, Get, Post } from '@nestjs/common';
import { Roles, TenantId } from '../../common/decorators';
import { ConnectionInfo, OpenwaService, QrInfo } from './openwa.service';

/**
 * Conexão do WhatsApp do condomínio (usado na tela "Fila WhatsApp").
 * Escopo do tenant do usuário logado — síndico/admin conectam o número do próprio condomínio.
 */
@Controller('whatsapp/connection')
@Roles('sindico', 'admin')
export class OpenwaConnectionController {
  constructor(private readonly service: OpenwaService) {}

  /** Status atual da conexão (provisiona a instância de forma preguiçosa se necessário). */
  @Get()
  status(@TenantId() tenantId: string): Promise<ConnectionInfo> {
    return this.service.getConnection(tenantId);
  }

  /** Inicia a sessão e começa o pareamento (gera QR). */
  @Post('connect')
  connect(@TenantId() tenantId: string): Promise<ConnectionInfo> {
    return this.service.connect(tenantId);
  }

  /** QR de pareamento atual (o front faz polling enquanto não conecta). */
  @Get('qr')
  qr(@TenantId() tenantId: string): Promise<QrInfo> {
    return this.service.getQr(tenantId);
  }

  /** Gera um novo QR (reinicia a sessão) — útil quando o QR expira. */
  @Post('restart')
  restart(@TenantId() tenantId: string): Promise<ConnectionInfo> {
    return this.service.restart(tenantId);
  }

  /** Desconecta o número (mantém a instância para reconectar depois). */
  @Post('disconnect')
  disconnect(@TenantId() tenantId: string): Promise<ConnectionInfo> {
    return this.service.disconnect(tenantId);
  }
}
