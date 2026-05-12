import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import twilio, { Twilio, validateRequest } from 'twilio';
import { WhatsappGateway } from './whatsapp.gateway';
import {
  InboundMessage,
  SendResult,
  SendTemplateParams,
  SendTextParams,
  StatusUpdate,
  WebhookVerifyParams,
  WhatsappProvider,
} from './types';

export class TwilioAdapter implements WhatsappGateway {
  readonly provider: WhatsappProvider = 'twilio';
  private readonly logger = new Logger(TwilioAdapter.name);
  private readonly accountSid: string;
  private readonly authToken: string;
  private readonly fromNumber: string;
  private readonly verifySignature: boolean;
  private readonly statusCallbackUrl: string | undefined;
  private readonly templateMap: Record<string, string>;
  private _client: Twilio | null = null;

  constructor(config: ConfigService) {
    this.accountSid = config.get<string>('TWILIO_ACCOUNT_SID', '') ?? '';
    this.authToken = config.get<string>('TWILIO_AUTH_TOKEN', '') ?? '';
    this.fromNumber = config.get<string>('TWILIO_WHATSAPP_FROM', '') ?? '';
    this.verifySignature = config.get<boolean>('WHATSAPP_WEBHOOK_VERIFY', true);
    const base = (config.get<string>('WEBHOOK_BASE_URL', '') ?? '').replace(/\/+$/, '');
    this.statusCallbackUrl = base ? `${base}/api/webhooks/whatsapp/twilio` : undefined;
    this.templateMap = {
      encomenda_chegou: config.get<string>('TWILIO_TEMPLATE_ENCOMENDA_CHEGOU', '') ?? '',
      retirada_confirmada: config.get<string>('TWILIO_TEMPLATE_RETIRADA_CONFIRMADA', '') ?? '',
    };
  }

  private getClient(): Twilio {
    if (this._client) return this._client;
    if (!this.accountSid.startsWith('AC') || !this.authToken) {
      throw new Error(
        'Twilio não configurado: defina TWILIO_ACCOUNT_SID (deve começar com AC) e TWILIO_AUTH_TOKEN no .env',
      );
    }
    if (!this.fromNumber) {
      throw new Error('Twilio não configurado: defina TWILIO_WHATSAPP_FROM no .env');
    }
    this._client = twilio(this.accountSid, this.authToken);
    return this._client;
  }

  async sendText({ to, body }: SendTextParams): Promise<SendResult> {
    const client = this.getClient();
    const message = await client.messages.create({
      from: this.toWhatsappAddress(this.fromNumber),
      to: this.toWhatsappAddress(to),
      body,
      ...(this.statusCallbackUrl ? { statusCallback: this.statusCallbackUrl } : {}),
    });
    return { providerMessageId: message.sid, rawResponse: message };
  }

  async sendTemplate({ to, templateName, variables }: SendTemplateParams): Promise<SendResult> {
    const contentSid = this.templateMap[templateName];
    if (!contentSid) {
      throw new Error(
        `Template "${templateName}" não configurado. Defina TWILIO_TEMPLATE_${templateName.toUpperCase()} no .env`,
      );
    }
    const client = this.getClient();
    const message = await client.messages.create({
      from: this.toWhatsappAddress(this.fromNumber),
      to: this.toWhatsappAddress(to),
      contentSid,
      contentVariables: JSON.stringify(variables),
      ...(this.statusCallbackUrl ? { statusCallback: this.statusCallbackUrl } : {}),
    });
    return { providerMessageId: message.sid, rawResponse: message };
  }

  verifyInboundSignature({ url, signature, body }: WebhookVerifyParams): boolean {
    if (!this.verifySignature) return true;
    if (!signature || !this.authToken) return false;
    return validateRequest(this.authToken, signature, url, body as Record<string, string>);
  }

  parseInboundMessage(body: Record<string, unknown>): InboundMessage | null {
    const sid = body['MessageSid'] ?? body['SmsMessageSid'];
    const from = body['From'];
    const to = body['To'];
    if (!sid || !from || !to) return null;
    if (body['MessageStatus']) return null;

    const numMedia = Number(body['NumMedia'] ?? 0);
    const messageType: InboundMessage['messageType'] = numMedia > 0 ? 'image' : 'text';

    return {
      providerMessageId: String(sid),
      from: this.stripWhatsappPrefix(String(from)),
      to: this.stripWhatsappPrefix(String(to)),
      body: String(body['Body'] ?? ''),
      messageType,
      receivedAt: new Date(),
      raw: body,
    };
  }

  parseStatusUpdate(body: Record<string, unknown>): StatusUpdate | null {
    const sid = body['MessageSid'];
    const status = body['MessageStatus'];
    if (!sid || !status) return null;

    const canonical = this.mapTwilioStatus(String(status));
    if (!canonical) return null;

    const errCode = body['ErrorCode'] ? String(body['ErrorCode']) : undefined;
    const errMsg = body['ErrorMessage'] ? String(body['ErrorMessage']) : undefined;
    const errorMessage =
      errMsg ?? (errCode ? `Erro Twilio ${errCode}` : undefined);
    return { providerMessageId: String(sid), status: canonical, errorMessage, raw: body };
  }

  private toWhatsappAddress(e164: string): string {
    return e164.startsWith('whatsapp:') ? e164 : `whatsapp:${e164}`;
  }

  private stripWhatsappPrefix(addr: string): string {
    return addr.replace(/^whatsapp:/, '');
  }

  private mapTwilioStatus(s: string): StatusUpdate['status'] | null {
    switch (s.toLowerCase()) {
      case 'queued':
      case 'sending':
      case 'sent':
      case 'accepted':
        return 'sent';
      case 'delivered':
        return 'delivered';
      case 'read':
        return 'read';
      case 'failed':
      case 'undelivered':
        return 'failed';
      default:
        return null;
    }
  }
}
