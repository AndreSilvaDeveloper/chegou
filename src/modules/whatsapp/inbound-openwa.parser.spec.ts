import { normalizarJid, parseMensagemOpenWa } from './inbound-openwa.parser';

describe('normalizarJid', () => {
  it('converte o JID do WhatsApp em E.164', () => {
    expect(normalizarJid('5532999991234@c.us')).toBe('+5532999991234');
  });

  it('aceita o formato com prefixo de canal', () => {
    expect(normalizarJid('whatsapp:+5532999991234')).toBe('+5532999991234');
  });

  it('devolve vazio para o que não tem número', () => {
    expect(normalizarJid('status@broadcast')).toBe('');
    expect(normalizarJid(undefined)).toBe('');
  });
});

describe('parseMensagemOpenWa', () => {
  const base = {
    event: 'message.received',
    data: {
      id: 'ABC123',
      from: '5532999991234@c.us',
      to: '5532888887777@c.us',
      body: 'cheguei',
      type: 'chat',
      timestamp: 1_800_000_000,
    },
  };

  it('traduz a mensagem para o formato do histórico', () => {
    const msg = parseMensagemOpenWa(base)!;

    expect(msg.providerMessageId).toBe('ABC123');
    expect(msg.from).toBe('+5532999991234');
    expect(msg.to).toBe('+5532888887777');
    expect(msg.body).toBe('cheguei');
    expect(msg.messageType).toBe('text');
    expect(msg.receivedAt).toEqual(new Date(1_800_000_000 * 1000));
  });

  // O gateway não tem contrato estável entre versões — por isso lemos por
  // alternativas em vez de assumir uma forma só.
  it('aceita os nomes alternativos de campo do gateway', () => {
    const msg = parseMensagemOpenWa({
      event: 'message',
      data: { messageId: 'X1', chatId: '5511900000000@c.us', text: 'oi' },
    })!;

    expect(msg.providerMessageId).toBe('X1');
    expect(msg.from).toBe('+5511900000000');
    expect(msg.body).toBe('oi');
  });

  it('ignora eco da própria mensagem enviada pelo condomínio', () => {
    expect(parseMensagemOpenWa({ event: 'message', data: { ...base.data, fromMe: true } })).toBeNull();
  });

  it('ignora evento sem id, sem remetente ou sem texto', () => {
    expect(parseMensagemOpenWa({ event: 'message', data: { from: '553299@c.us' } })).toBeNull();
    expect(parseMensagemOpenWa({ event: 'message', data: { id: 'A', body: 'oi' } })).toBeNull();
    expect(
      parseMensagemOpenWa({ event: 'message', data: { id: 'A', from: '553299@c.us', body: '   ' } }),
    ).toBeNull();
  });

  it('cai para a hora do registro quando o gateway não manda timestamp', () => {
    const antes = Date.now();
    const msg = parseMensagemOpenWa({
      event: 'message',
      data: { id: 'A', from: '5532999991234@c.us', body: 'oi' },
    })!;
    expect(msg.receivedAt.getTime()).toBeGreaterThanOrEqual(antes);
  });
});
