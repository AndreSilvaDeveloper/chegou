import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { AcessoService } from './acesso.service';
import { PaymentApiClient, PaymentApiError } from './payment-api.client';

/**
 * O cliente pode usar o sistema?
 *
 * **Todo teste aqui existe para provar que a dúvida libera.** Este é o único
 * serviço do projeto capaz de tirar um cliente adimplente do ar por engano, e o
 * conjunto abaixo é a garantia de que nenhum caminho de falha faz isso.
 */
class RedisFake {
  readonly dados = new Map<string, string>();
  quebrado = false;

  async get(chave: string) {
    if (this.quebrado) throw new Error('redis fora');
    return this.dados.get(chave) ?? null;
  }

  async set(chave: string, valor: string) {
    if (this.quebrado) throw new Error('redis fora');
    this.dados.set(chave, valor);
    return 'OK' as const;
  }

  async del(chave: string) {
    this.dados.delete(chave);
    return 1;
  }
}

const BLOQUEADO = {
  allowed: false,
  reasons: ['1 cobranca(s) vencida(s) ha mais de 5 dia(s)'],
  customBlockMessage: 'Assinatura do Chegou em atraso.',
  summary: { overdueCharges: 1, totalOverdueValue: 418.8, oldestOverdueDays: 12 },
};

describe('AcessoService', () => {
  let redis: RedisFake;
  let api: { configured: boolean; get: jest.Mock };

  const criar = (bloqueioAtivo = true) => {
    const config = {
      get: (chave: string, padrao?: unknown) =>
        chave === 'PAYMENT_BLOQUEIO_ATIVO' ? bloqueioAtivo : padrao,
    } as unknown as ConfigService;
    return new AcessoService(
      api as unknown as PaymentApiClient,
      config,
      redis as unknown as Redis,
    );
  };

  beforeEach(() => {
    redis = new RedisFake();
    api = { configured: true, get: jest.fn() };
  });

  describe('o interruptor', () => {
    it('**nasce desligado**: sem PAYMENT_BLOQUEIO_ATIVO, nada bloqueia', async () => {
      const service = criar(false);

      expect(service.ativo).toBe(false);
      await expect(service.situacao('42')).resolves.toEqual({ liberado: true });
      expect(api.get).not.toHaveBeenCalled();
    });

    it('sem integração configurada também não bloqueia', () => {
      api.configured = false;
      expect(criar(true).ativo).toBe(false);
    });
  });

  describe('fail-open — nenhum caminho de falha bloqueia', () => {
    it('gateway fora do ar libera', async () => {
      api.get.mockRejectedValue(new PaymentApiError(0, 'timeout'));

      await expect(criar().situacao('42')).resolves.toEqual({ liberado: true });
    });

    it('erro 500 libera', async () => {
      api.get.mockRejectedValue(new PaymentApiError(500, 'boom'));

      await expect(criar().situacao('42')).resolves.toEqual({ liberado: true });
    });

    it('404 (cliente que não existe lá) libera', async () => {
      api.get.mockRejectedValue(new PaymentApiError(404, 'not found'));

      await expect(criar().situacao('42')).resolves.toEqual({ liberado: true });
    });

    it('cliente sem customer no gateway libera — nunca foi cobrado', async () => {
      await expect(criar().situacao(null)).resolves.toEqual({ liberado: true });
      await expect(criar().situacao(undefined)).resolves.toEqual({ liberado: true });
      expect(api.get).not.toHaveBeenCalled();
    });

    it('Redis fora não bloqueia: cai para a consulta', async () => {
      redis.quebrado = true;
      api.get.mockResolvedValue({ allowed: true });

      await expect(criar().situacao('42')).resolves.toEqual({ liberado: true });
    });

    it('resposta que não entendemos libera', async () => {
      api.get.mockResolvedValue({ coisa: 'estranha' });

      await expect(criar().situacao('42')).resolves.toEqual({ liberado: true });
    });
  });

  describe('bloqueio de verdade', () => {
    it('traduz motivo, valor e dias de atraso', async () => {
      api.get.mockResolvedValue(BLOQUEADO);

      const r = await criar().situacao('42');

      expect(r).toEqual({
        liberado: false,
        motivo: 'Assinatura do Chegou em atraso.',
        valorEmAberto: 418.8,
        faturasVencidas: 1,
        diasEmAtraso: 12,
      });
    });

    it('sem mensagem customizada, usa os motivos da API', async () => {
      api.get.mockResolvedValue({ ...BLOQUEADO, customBlockMessage: null });

      const r = await criar().situacao('42');

      expect(r.motivo).toMatch(/vencida/i);
    });
  });

  describe('cache', () => {
    it('a segunda consulta não vai à API', async () => {
      api.get.mockResolvedValue({ allowed: true });
      const service = criar();

      await service.situacao('42');
      await service.situacao('42');

      expect(api.get).toHaveBeenCalledTimes(1);
    });

    it('**`esquecer` destrava na hora** — quem pagou não espera o TTL', async () => {
      api.get.mockResolvedValue(BLOQUEADO);
      const service = criar();
      await service.situacao('42');

      await service.esquecer('42');
      api.get.mockResolvedValue({ allowed: true });

      // Cinco minutos olhando uma tela travada depois de pagar é a pior
      // experiência que este sistema pode oferecer.
      await expect(service.situacao('42')).resolves.toEqual({ liberado: true });
    });

    it('o cache é por cliente', async () => {
      api.get.mockResolvedValue({ allowed: true });
      const service = criar();

      await service.situacao('42');
      await service.situacao('99');

      expect(api.get).toHaveBeenCalledTimes(2);
    });
  });
});
