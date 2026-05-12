import {
  InboundMessage,
  SendResult,
  SendTemplateParams,
  SendTextParams,
  StatusUpdate,
  WebhookVerifyParams,
  WhatsappProvider,
} from './types';

export const WHATSAPP_GATEWAY = Symbol('WHATSAPP_GATEWAY');

export interface WhatsappGateway {
  readonly provider: WhatsappProvider;

  sendText(params: SendTextParams): Promise<SendResult>;
  sendTemplate(params: SendTemplateParams): Promise<SendResult>;

  verifyInboundSignature(params: WebhookVerifyParams): boolean;
  parseInboundMessage(body: Record<string, unknown>): InboundMessage | null;
  parseStatusUpdate(body: Record<string, unknown>): StatusUpdate | null;
}
