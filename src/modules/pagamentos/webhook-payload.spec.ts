import { lerEventoPagamento } from './webhook-payload';

/**
 * O parser do evento de pagamento.
 *
 * **O formato do repasse ainda não foi visto na prática**, então o que se prova
 * aqui é que os três envelopes plausíveis são lidos — e que o quarto, qualquer
 * que seja, degrada com segurança em vez de derrubar o processamento.
 */
describe('lerEventoPagamento', () => {
  describe('envelope cru do Asaas', () => {
    const asaas = {
      id: 'evt_650f80da5cd46f001adc2e72',
      event: 'PAYMENT_RECEIVED',
      payment: {
        id: 'pay_3219854',
        status: 'RECEIVED',
        value: 418.8,
        externalReference: 'fatura-uuid-1',
        asaasId: 'pay_3219854',
      },
    };

    it('lê id, tipo, referência e status', () => {
      expect(lerEventoPagamento(asaas)).toMatchObject({
        eventoId: 'evt_650f80da5cd46f001adc2e72',
        tipo: 'PAYMENT_RECEIVED',
        referenciaExterna: 'fatura-uuid-1',
        status: 'RECEIVED',
        statusConfiavel: true,
      });
    });

    it('o `id` da RAIZ é o do evento, não o da cobrança', () => {
      // Busca em largura: o campo do envelope externo vence o homônimo
      // enterrado. Trocar os dois faria a deduplicação usar o id do pagamento —
      // e dois eventos do mesmo pagamento (confirmado, depois liquidado)
      // passariam a ser considerados o mesmo evento.
      expect(lerEventoPagamento(asaas)!.eventoId).not.toBe('pay_3219854');
    });
  });

  describe('envelope embrulhado', () => {
    it('acha o pagamento em profundidade', () => {
      const embrulhado = {
        eventId: 'evt_99',
        eventType: 'PAYMENT_CONFIRMED',
        data: { body: { payment: { status: 'CONFIRMED', externalReference: 'fatura-2' } } },
      };

      expect(lerEventoPagamento(embrulhado)).toMatchObject({
        eventoId: 'evt_99',
        tipo: 'PAYMENT_CONFIRMED',
        referenciaExterna: 'fatura-2',
        status: 'CONFIRMED',
        statusConfiavel: true,
      });
    });
  });

  describe('WebhookEventResponse da própria Payment API', () => {
    const deles = {
      id: 4521,
      asaasEventId: 'evt_650f',
      eventType: 'PAYMENT_RECEIVED',
      status: 'PROCESSED',
      processedResourceType: 'Charge',
      processedResourceId: 9810,
      processedAsaasId: 'pay_3219854',
    };

    it('prefere `asaasEventId` ao `id` local deles', () => {
      // O `id` ali é da linha de evento no banco DELES; o que identifica o
      // evento de verdade é o do Asaas.
      expect(lerEventoPagamento(deles)!.eventoId).toBe('evt_650f');
    });

    it('**marca o status como NÃO confiável** — `PROCESSED` é do evento, não do pagamento', () => {
      // Esta é a armadilha do arquivo inteiro: `status` aqui é o
      // `WebhookEventStatus` (PROCESSED/FAILED/DLQ), não o `ChargeStatus`.
      // Confundir os dois marcaria fatura como paga por causa de um evento
      // processado com sucesso que dizia justamente o contrário.
      const evento = lerEventoPagamento(deles)!;
      expect(evento.statusConfiavel).toBe(false);
      expect(evento.cobrancaId).toBe('9810');
      expect(evento.asaasId).toBe('pay_3219854');
    });
  });

  describe('degradação segura', () => {
    it('sem id do evento devolve null — sem dedup não se processa', () => {
      expect(lerEventoPagamento({ event: 'PAYMENT_RECEIVED' })).toBeNull();
    });

    it.each([[null], [undefined], ['texto'], [42]])('corpo %p devolve null', (corpo) => {
      expect(lerEventoPagamento(corpo)).toBeNull();
    });

    it('campo desconhecido é ignorado, não derruba', () => {
      const r = lerEventoPagamento({
        id: 'evt_1',
        event: 'PAYMENT_RECEIVED',
        campoQueInventaram: { outro: 'coisa' },
        payment: { status: 'RECEIVED', externalReference: 'f-1', novidade: [1, 2, 3] },
      });

      expect(r).toMatchObject({ eventoId: 'evt_1', referenciaExterna: 'f-1' });
    });

    it('evento sem referência externa ainda serve — a correlação cai para o id', () => {
      const r = lerEventoPagamento({
        id: 'evt_1',
        event: 'PAYMENT_RECEIVED',
        payment: { chargeId: 5030, status: 'RECEIVED' },
      });

      expect(r).toMatchObject({ referenciaExterna: null, cobrancaId: '5030' });
    });

    it('número vira texto — id de cobrança é bigint do outro lado', () => {
      const r = lerEventoPagamento({ id: 77, event: 'X', payment: { chargeId: 5030 } });
      expect(r!.eventoId).toBe('77');
      expect(r!.cobrancaId).toBe('5030');
    });

    it('não entra em laço com referência circular', () => {
      const circular: Record<string, unknown> = { id: 'evt_1', event: 'X' };
      circular.eu = circular;

      expect(() => lerEventoPagamento(circular)).not.toThrow();
    });
  });
});
