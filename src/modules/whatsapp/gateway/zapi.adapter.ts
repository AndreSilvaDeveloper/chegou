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

export class ZApiAdapter implements WhatsappGateway {
  readonly provider: WhatsappProvider = 'zapi';

  sendText(_params: SendTextParams): Promise<SendResult> {
    throw new Error('ZApiAdapter.sendText: implementação pendente');
  }

  sendTemplate(_params: SendTemplateParams): Promise<SendResult> {
    throw new Error('ZApiAdapter.sendTemplate: implementação pendente');
  }

  verifyInboundSignature(_params: WebhookVerifyParams): boolean {
    return false;
  }

  parseInboundMessage(_body: Record<string, unknown>): InboundMessage | null {
    return null;
  }

  parseStatusUpdate(_body: Record<string, unknown>): StatusUpdate | null {
    return null;
  }
}
