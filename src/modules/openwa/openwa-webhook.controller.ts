import { Body, Controller, Logger, Param, Post } from '@nestjs/common';
import { Public } from '../../common/decorators';
import { OpenWaSessionStatus } from './openwa.client';
import { OpenwaService } from './openwa.service';

/** Mapa evento de sessão → status simplificado do gateway. */
const SESSION_EVENT_STATUS: Record<string, OpenWaSessionStatus> = {
  'session.authenticated': 'ready',
  'session.disconnected': 'disconnected',
};

interface OpenWaWebhookBody {
  event?: string;
  data?: {
    status?: OpenWaSessionStatus;
    phone?: string | null;
    pushName?: string | null;
    [k: string]: unknown;
  };
}

/**
 * Receptor de webhooks do gateway OpenWA (por sessão → um condomínio).
 * Hoje só sincroniza o status de conexão da sessão para refletir na UI sem polling.
 * (Regras de disparo / mensagens inbound serão tratadas numa fase futura.)
 */
@Public()
@Controller('webhooks/openwa')
export class OpenwaWebhookController {
  private readonly logger = new Logger(OpenwaWebhookController.name);

  constructor(private readonly service: OpenwaService) {}

  @Post(':tenantId')
  async receive(@Param('tenantId') tenantId: string, @Body() body: OpenWaWebhookBody) {
    const event = body?.event ?? '';

    if (event === 'session.status' && body.data?.status) {
      await this.service.applyWebhookStatus(tenantId, body.data.status, body.data.phone, body.data.pushName);
      return { ok: true, kind: 'session.status' };
    }

    const mapped = SESSION_EVENT_STATUS[event];
    if (mapped) {
      await this.service.applyWebhookStatus(tenantId, mapped, body.data?.phone, body.data?.pushName);
      return { ok: true, kind: event };
    }

    // message.received / message.ack / message.failed: fora do escopo desta fase.
    this.logger.debug(`Webhook OpenWA ignorado (tenant ${tenantId}, event=${event || 'desconhecido'})`);
    return { ok: true, kind: 'ignored' };
  }
}
