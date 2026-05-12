import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Headers,
  Logger,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { Public } from '../../common/decorators';
import { WHATSAPP_GATEWAY } from './gateway/whatsapp.gateway';
import type { WhatsappGateway } from './gateway/whatsapp.gateway';
import type { WhatsappProvider } from './gateway/types';
import { Inject } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';

@Public()
@Controller('webhooks/whatsapp')
export class WhatsappWebhookController {
  private readonly logger = new Logger(WhatsappWebhookController.name);

  constructor(
    @Inject(WHATSAPP_GATEWAY) private readonly gateway: WhatsappGateway,
    private readonly whatsapp: WhatsappService,
    private readonly config: ConfigService,
  ) {}

  @Post(':provider')
  async receive(
    @Param('provider') provider: string,
    @Body() body: Record<string, unknown>,
    @Headers('x-twilio-signature') twilioSig: string | undefined,
    @Req() req: Request,
  ) {
    if (provider !== this.gateway.provider) {
      throw new BadRequestException(`Provider ${provider} não é o configurado (${this.gateway.provider})`);
    }

    const baseUrl =
      this.config.get<string>('WEBHOOK_BASE_URL') ?? `${req.protocol}://${req.get('host')}`;
    const fullUrl = `${baseUrl}${req.originalUrl}`;

    const ok = this.gateway.verifyInboundSignature({ url: fullUrl, signature: twilioSig, body });
    if (!ok) {
      this.logger.warn(`Assinatura inválida em webhook de ${provider}`);
      throw new ForbiddenException('Assinatura inválida');
    }

    const status = this.gateway.parseStatusUpdate(body);
    if (status) {
      await this.whatsapp.recordStatus(status);
      return { ok: true, kind: 'status' };
    }

    const inbound = this.gateway.parseInboundMessage(body);
    if (inbound) {
      const msg = await this.whatsapp.recordInbound(inbound);
      this.whatsapp.handleInboundIntent(msg).catch((err) =>
        this.logger.error(`Falha ao processar intent inbound`, err instanceof Error ? err.stack : err),
      );
      return { ok: true, kind: 'inbound' };
    }

    this.logger.debug(`Webhook recebido sem handler: ${JSON.stringify(body)}`);
    return { ok: true, kind: 'unknown' };
  }
}
