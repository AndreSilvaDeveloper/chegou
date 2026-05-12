import { ConfigService } from '@nestjs/config';
import { TwilioAdapter } from './twilio.adapter';

function makeAdapter(env: Record<string, string | boolean | undefined> = {}): TwilioAdapter {
  const config = {
    get: (key: string, defaultVal?: unknown) => env[key] ?? defaultVal ?? '',
    getOrThrow: (key: string) => {
      const v = env[key];
      if (v === undefined) throw new Error(`Missing ${key}`);
      return v;
    },
  } as unknown as ConfigService;
  return new TwilioAdapter(config);
}

describe('TwilioAdapter.parseInboundMessage', () => {
  const adapter = makeAdapter({ WHATSAPP_WEBHOOK_VERIFY: false });

  it('parseia mensagem de texto válida', () => {
    const result = adapter.parseInboundMessage({
      MessageSid: 'SMabc',
      From: 'whatsapp:+5511988880001',
      To: 'whatsapp:+14155238886',
      Body: 'vou retirar',
      NumMedia: '0',
    });
    expect(result).toEqual(
      expect.objectContaining({
        providerMessageId: 'SMabc',
        from: '+5511988880001',
        to: '+14155238886',
        body: 'vou retirar',
        messageType: 'text',
      }),
    );
  });

  it('classifica como image quando NumMedia > 0', () => {
    const result = adapter.parseInboundMessage({
      MessageSid: 'SMimg',
      From: 'whatsapp:+5511988880001',
      To: 'whatsapp:+14155238886',
      NumMedia: '1',
    });
    expect(result?.messageType).toBe('image');
  });

  it('retorna null se for status update (tem MessageStatus)', () => {
    const result = adapter.parseInboundMessage({
      MessageSid: 'SMxyz',
      From: 'whatsapp:+5511988880001',
      To: 'whatsapp:+14155238886',
      MessageStatus: 'delivered',
    });
    expect(result).toBeNull();
  });

  it('retorna null se faltar campos críticos', () => {
    expect(adapter.parseInboundMessage({ Body: 'oi' })).toBeNull();
  });
});

describe('TwilioAdapter.parseStatusUpdate', () => {
  const adapter = makeAdapter({ WHATSAPP_WEBHOOK_VERIFY: false });

  it.each([
    ['sent', 'sent'],
    ['delivered', 'delivered'],
    ['read', 'read'],
    ['failed', 'failed'],
    ['undelivered', 'failed'],
  ])('mapeia Twilio status "%s" para canônico "%s"', (twilio, canonical) => {
    const result = adapter.parseStatusUpdate({ MessageSid: 'SM1', MessageStatus: twilio });
    expect(result?.status).toBe(canonical);
  });

  it('retorna null em status desconhecido', () => {
    expect(adapter.parseStatusUpdate({ MessageSid: 'SM1', MessageStatus: 'totally-unknown' })).toBeNull();
  });
});
