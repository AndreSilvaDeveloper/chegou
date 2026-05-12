export type WhatsappProvider = 'twilio' | 'zapi' | 'gupshup';

export interface SendTextParams {
  to: string;
  body: string;
}

export interface SendTemplateParams {
  to: string;
  templateName: string;
  variables: Record<string, string>;
}

export interface SendResult {
  providerMessageId: string;
  rawResponse: unknown;
}

export interface InboundMessage {
  providerMessageId: string;
  from: string;
  to: string;
  body: string;
  messageType: 'text' | 'image' | 'interactive' | 'template' | 'system';
  receivedAt: Date;
  raw: Record<string, unknown>;
}

export interface StatusUpdate {
  providerMessageId: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  errorMessage?: string;
  raw: Record<string, unknown>;
}

export interface WebhookVerifyParams {
  url: string;
  signature: string | undefined;
  body: Record<string, unknown>;
}
