import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import twilio, { Twilio } from 'twilio';

@Injectable()
export class SmsGateway {
  private readonly logger = new Logger(SmsGateway.name);
  private readonly accountSid: string;
  private readonly authToken: string;
  private readonly fromNumber: string;
  private _client: Twilio | null = null;

  constructor(config: ConfigService) {
    this.accountSid = config.get<string>('TWILIO_ACCOUNT_SID', '') ?? '';
    this.authToken = config.get<string>('TWILIO_AUTH_TOKEN', '') ?? '';
    this.fromNumber = config.get<string>('TWILIO_SMS_FROM', '') ?? '';
  }

  get isConfigured(): boolean {
    return this.accountSid.startsWith('AC') && !!this.authToken && !!this.fromNumber;
  }

  private getClient(): Twilio {
    if (this._client) return this._client;
    if (!this.isConfigured) {
      throw new Error('SMS não configurado: defina TWILIO_SMS_FROM, TWILIO_ACCOUNT_SID e TWILIO_AUTH_TOKEN');
    }
    this._client = twilio(this.accountSid, this.authToken);
    return this._client;
  }

  async sendSms(to: string, body: string): Promise<{ providerMessageId: string }> {
    const client = this.getClient();
    const message = await client.messages.create({ from: this.fromNumber, to, body });
    return { providerMessageId: message.sid };
  }
}
