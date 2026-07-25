import { Body, Controller, Logger, Param, Post } from '@nestjs/common';
import { Public } from '../../common/decorators';
import { WhatsappService } from './whatsapp.service';
import { OpenWaSessionStatus } from '../openwa/openwa.client';
import { OpenwaService } from '../openwa/openwa.service';
import { EVENTOS_MENSAGEM, OpenWaWebhookBody, parseMensagemOpenWa } from './inbound-openwa.parser';

/** Mapa evento de sessão → status simplificado do gateway. */
const SESSION_EVENT_STATUS: Record<string, OpenWaSessionStatus> = {
  'session.authenticated': 'ready',
  'session.disconnected': 'disconnected',
};

/**
 * Receptor de webhooks do gateway OpenWA (uma sessão por condomínio).
 *
 * Duas coisas chegam aqui: o status da conexão (para a tela refletir sem
 * polling) e as mensagens que o morador manda. A URL carrega o `tenantId`, mas
 * o dono da mensagem é resolvido pelo telefone do remetente — mesmo caminho que
 * já tratava a ambiguidade de um número cadastrado em dois condomínios.
 */
@Public()
@Controller('webhooks/openwa')
export class OpenwaWebhookController {
  private readonly logger = new Logger(OpenwaWebhookController.name);

  constructor(
    private readonly service: OpenwaService,
    private readonly whatsapp: WhatsappService,
  ) {}

  @Post(':tenantId')
  async receive(@Param('tenantId') tenantId: string, @Body() body: OpenWaWebhookBody) {
    const event = body?.event ?? '';
    const data = (body?.data ?? {}) as {
      status?: OpenWaSessionStatus;
      phone?: string | null;
      pushName?: string | null;
    };

    if (event === 'session.status' && data.status) {
      await this.service.applyWebhookStatus(tenantId, data.status, data.phone, data.pushName);
      return { ok: true, kind: 'session.status' };
    }

    const mapped = SESSION_EVENT_STATUS[event];
    if (mapped) {
      await this.service.applyWebhookStatus(tenantId, mapped, data.phone, data.pushName);
      return { ok: true, kind: event };
    }

    if (EVENTOS_MENSAGEM.includes(event)) {
      const inbound = parseMensagemOpenWa(body);
      if (!inbound) {
        this.logger.debug(`Mensagem sem dados suficientes (tenant ${tenantId}) — ignorada`);
        return { ok: true, kind: 'message.ignored' };
      }

      const msg = await this.whatsapp.recordInbound(inbound);
      // A resposta automática não segura o webhook: o gateway reentrega quando
      // demoramos, e reentrega vira mensagem duplicada para o morador.
      this.whatsapp
        .handleInboundIntent(msg)
        .catch((err) =>
          this.logger.error(
            'Falha ao responder mensagem recebida',
            err instanceof Error ? err.stack : String(err),
          ),
        );
      return { ok: true, kind: 'message.received' };
    }

    this.logger.debug(
      `Webhook OpenWA ignorado (tenant ${tenantId}, event=${event || 'desconhecido'})`,
    );
    return { ok: true, kind: 'ignored' };
  }
}
