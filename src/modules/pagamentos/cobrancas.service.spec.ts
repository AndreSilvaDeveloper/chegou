import { StatusFatura } from '../../database/entities/assinatura-fatura.entity';
import { CobrancasService } from './cobrancas.service';
import { PaymentApiClient, PaymentApiError } from './payment-api.client';
import { deveAvancar, estadoTerminal, statusDaFatura } from './status-cobranca';

const CHARGE = {
  id: 5030,
  customerId: 42,
  asaasId: 'pay_1',
  value: 418.8,
  dueDate: '2026-05-10',
  status: 'PENDING' as const,
  externalReference: 'fatura-1',
  invoiceUrl: 'https://asaas.com/i/5030',
};

const PEDIDO = {
  customerId: '42',
  valor: 418.8,
  vencimento: '2026-05-10',
  descricao: 'Chegou · assinatura 04/2026 · Edifício Solar',
  referenciaExterna: 'fatura-1',
  idempotencyKey: 'chave-fixa',
};

describe('CobrancasService', () => {
  let api: { configured: boolean; get: jest.Mock; post: jest.Mock; delete: jest.Mock };
  let service: CobrancasService;

  beforeEach(() => {
    api = { configured: true, get: jest.fn(), post: jest.fn(), delete: jest.fn() };
    service = new CobrancasService(api as unknown as PaymentApiClient);
  });

  describe('emitir', () => {
    it('usa /charges/undefined — o cliente escolhe o método no link', async () => {
      api.post.mockResolvedValue(CHARGE);

      const r = await service.emitir(PEDIDO);

      expect(api.post.mock.calls[0][0]).toBe('/charges/undefined');
      expect(r).toEqual({
        cobrancaId: '5030',
        asaasId: 'pay_1',
        invoiceUrl: 'https://asaas.com/i/5030',
        statusGateway: 'PENDING',
        valor: 418.8,
      });
    });

    it('a Idempotency-Key vai como terceiro argumento, não no corpo', async () => {
      api.post.mockResolvedValue(CHARGE);

      await service.emitir(PEDIDO);

      expect(api.post.mock.calls[0][2]).toBe('chave-fixa');
      expect(api.post.mock.calls[0][1]).not.toHaveProperty('idempotencyKey');
    });

    it('**409 é sucesso**: lê a cobrança do replay em vez de marcar erro', async () => {
      // 409 é a resposta de um retry idempotente que deu certo. Tratar como
      // falha marcaria a fatura como erro tendo cobrança viva no gateway — o
      // cliente recebe o link e nós achamos que não emitimos.
      api.post.mockRejectedValue(new PaymentApiError(409, 'replay', CHARGE));

      const r = await service.emitir(PEDIDO);

      expect(r.cobrancaId).toBe('5030');
    });

    it('409 sem corpo procura pela referência externa', async () => {
      api.post.mockRejectedValue(new PaymentApiError(409, 'replay', { message: 'duplicado' }));
      api.get.mockResolvedValue({ content: [CHARGE] });

      const r = await service.emitir(PEDIDO);

      expect(r.cobrancaId).toBe('5030');
    });

    it('409 sem corpo e sem achar a cobrança propaga o erro', async () => {
      api.post.mockRejectedValue(new PaymentApiError(409, 'replay', null));
      api.get.mockResolvedValue({ content: [] });

      await expect(service.emitir(PEDIDO)).rejects.toMatchObject({ status: 409 });
    });

    it('outros erros propagam', async () => {
      api.post.mockRejectedValue(new PaymentApiError(400, 'customer inválido'));

      await expect(service.emitir(PEDIDO)).rejects.toMatchObject({ status: 400 });
    });
  });

  describe('cancelar', () => {
    it('chama DELETE na cobrança', async () => {
      await service.cancelar('5030');
      expect(api.delete).toHaveBeenCalledWith('/charges/5030');
    });

    it('409 não é erro: cobrança que não dá para cancelar já não será paga', async () => {
      api.delete.mockRejectedValue(new PaymentApiError(409, 'estado inválido'));
      await expect(service.cancelar('5030')).resolves.toBeUndefined();
    });

    it('502 propaga — o cancelamento local depende deste passo', async () => {
      api.delete.mockRejectedValue(new PaymentApiError(502, 'Asaas fora'));
      await expect(service.cancelar('5030')).rejects.toMatchObject({ status: 502 });
    });
  });

  describe('receberEmDinheiro', () => {
    it('manda a chave de idempotência — retry não pode dar duas baixas', async () => {
      await service.receberEmDinheiro('5030', 'baixa-fatura-1');

      expect(api.post).toHaveBeenCalledWith(
        '/charges/5030/received-in-cash',
        undefined,
        'baixa-fatura-1',
      );
    });

    it('409 é sucesso: já não estava pendente, ou seja, já foi recebida', async () => {
      api.post.mockRejectedValue(new PaymentApiError(409, 'estado inválido'));
      await expect(service.receberEmDinheiro('5030', 'k')).resolves.toBeUndefined();
    });
  });
});

describe('mapa de status', () => {
  it('CONFIRMED já é paga — o cliente não espera o D+1 do banco', () => {
    // Confirmado é "o pagamento aconteceu"; liquidado é "o dinheiro caiu".
    // Quem pagou não pode ficar bloqueado esperando a compensação.
    expect(statusDaFatura('CONFIRMED')).toBe(StatusFatura.PAGA);
    expect(statusDaFatura('RECEIVED')).toBe(StatusFatura.PAGA);
  });

  it('FAILED volta para aberta — a tentativa falhou, a dívida continua', () => {
    expect(statusDaFatura('FAILED')).toBe(StatusFatura.ABERTA);
  });

  it.each([
    ['REFUNDED', StatusFatura.ESTORNADA],
    ['REFUND_IN_PROGRESS', StatusFatura.ESTORNADA],
    ['CHARGEBACK_REQUESTED', StatusFatura.EM_DISPUTA],
    ['DUNNING_RECEIVED', StatusFatura.EM_DISPUTA],
    ['OVERDUE', StatusFatura.VENCIDA],
    ['CANCELED', StatusFatura.CANCELADA],
  ])('%s vira %s', (gateway, esperado) => {
    expect(statusDaFatura(gateway)).toBe(esperado);
  });

  it('status desconhecido devolve null em vez de quebrar', () => {
    // A API pode ganhar um estado novo antes de nós sabermos. Melhor guardar o
    // bruto e não mexer no nosso do que derrubar o webhook em produção.
    expect(statusDaFatura('ALGO_NOVO_QUE_INVENTARAM')).toBeNull();
  });

  describe('precedência — eventos fora de ordem', () => {
    it('não volta de paga para aberta por evento atrasado', () => {
      expect(deveAvancar(StatusFatura.PAGA, StatusFatura.ABERTA)).toBe(false);
      expect(deveAvancar(StatusFatura.PAGA, StatusFatura.VENCIDA)).toBe(false);
    });

    it('avança de aberta para paga', () => {
      expect(deveAvancar(StatusFatura.ABERTA, StatusFatura.PAGA)).toBe(true);
    });

    it('estorno depois da baixa avança — é a informação mais nova que importa', () => {
      expect(deveAvancar(StatusFatura.PAGA, StatusFatura.ESTORNADA)).toBe(true);
    });

    it('disputa é o topo: nenhum evento a apaga', () => {
      for (const s of Object.values(StatusFatura)) {
        if (s !== StatusFatura.EM_DISPUTA) {
          expect(deveAvancar(StatusFatura.EM_DISPUTA, s)).toBe(false);
        }
      }
    });
  });

  describe('estadoTerminal', () => {
    it('paga NÃO é terminal — estorno e chargeback chegam depois', () => {
      // Parece terminal e não é: perder o webhook de um estorno faria o cliente
      // aparecer como adimplente com o dinheiro já devolvido.
      expect(estadoTerminal(StatusFatura.PAGA)).toBe(false);
    });

    it('cancelada e estornada são terminais', () => {
      expect(estadoTerminal(StatusFatura.CANCELADA)).toBe(true);
      expect(estadoTerminal(StatusFatura.ESTORNADA)).toBe(true);
    });
  });
});
