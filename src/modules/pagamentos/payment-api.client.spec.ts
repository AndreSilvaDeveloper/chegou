import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { PaymentApiClient, PaymentApiError } from './payment-api.client';

/**
 * O cliente HTTP da Payment API.
 *
 * O que se prova aqui é o comportamento que custa dinheiro quando erra: o que
 * ganha retry e o que não ganha, quantas vezes um 401 pode renovar o token, e
 * que o par de tokens é reaproveitado em vez de um login por chamada.
 */

/** Redis de mentira com o que o cliente usa: GET/SET/DEL e o SET NX da trava. */
class RedisFake {
  readonly dados = new Map<string, string>();

  async get(chave: string): Promise<string | null> {
    return this.dados.get(chave) ?? null;
  }

  async set(chave: string, valor: string, ...args: unknown[]): Promise<'OK' | null> {
    // SET ... NX só grava se ainda não existir (é assim que a trava funciona).
    if (args.includes('NX') && this.dados.has(chave)) return null;
    this.dados.set(chave, valor);
    return 'OK';
  }

  async del(chave: string): Promise<number> {
    return this.dados.delete(chave) ? 1 : 0;
  }
}

const ENV: Record<string, unknown> = {
  PAYMENT_API_BASE_URL: 'https://pay.example.com',
  PAYMENT_API_COMPANY_ID: '7',
  PAYMENT_API_EMAIL: 'integracao@chegou.app',
  PAYMENT_API_PASSWORD: 'segredo',
  PAYMENT_API_TIMEOUT_MS: 5000,
};

const configFake = (over: Record<string, unknown> = {}): ConfigService => {
  const valores = { ...ENV, ...over };
  return {
    get: (chave: string, padrao?: unknown) => valores[chave] ?? padrao,
  } as unknown as ConfigService;
};

const resposta = (status: number, corpo: unknown): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => (corpo === undefined ? '' : JSON.stringify(corpo)),
  }) as Response;

const LOGIN_OK = {
  accessToken: 'access-1',
  refreshToken: 'refresh-1',
  expiresIn: 86_400_000,
  tokenType: 'Bearer',
};

describe('PaymentApiClient', () => {
  let fetchMock: jest.Mock;
  let redis: RedisFake;

  const criar = (over: Record<string, unknown> = {}) =>
    new PaymentApiClient(configFake(over), redis as unknown as Redis);

  beforeEach(() => {
    redis = new RedisFake();
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  /** Caminho por onde toda chamada passa: login e depois a chamada em si. */
  const comLoginE = (...respostas: Response[]) => {
    fetchMock.mockResolvedValueOnce(resposta(200, LOGIN_OK));
    for (const r of respostas) fetchMock.mockResolvedValueOnce(r);
  };

  const urls = () => fetchMock.mock.calls.map((c) => c[0] as string);

  describe('configuração', () => {
    it('sem base URL, a integração está desligada e ninguém chama nada', async () => {
      const client = criar({ PAYMENT_API_BASE_URL: '' });

      expect(client.configured).toBe(false);
      await expect(client.get('/customers')).rejects.toThrow(/Cobrança desligada/i);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('sem credenciais também está desligada — URL sozinha não autentica', () => {
      expect(criar({ PAYMENT_API_PASSWORD: '' }).configured).toBe(false);
    });
  });

  describe('autenticação', () => {
    it('faz login uma vez e reaproveita o token nas chamadas seguintes', async () => {
      const client = criar();
      comLoginE(resposta(200, { id: 1 }), resposta(200, { id: 2 }));

      await client.get('/customers/1');
      await client.get('/customers/2');

      // 1 login + 2 chamadas: a segunda leu o token do Redis.
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(urls().filter((u) => u.includes('/auth/login'))).toHaveLength(1);
    });

    it('manda Authorization e X-Company-Id em toda chamada autenticada', async () => {
      const client = criar();
      comLoginE(resposta(200, {}));

      await client.get('/customers');

      const headers = fetchMock.mock.calls[1][1].headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer access-1');
      expect(headers['X-Company-Id']).toBe('7');
    });

    it('`expiresIn` é lido como MILISSEGUNDOS', async () => {
      const client = criar();
      comLoginE(resposta(200, {}));
      const antes = Date.now();

      await client.get('/customers');

      const { expiraEm } = JSON.parse(redis.dados.get('pay:tokens')!);
      // 24h à frente, não 24 mil dias (que é o que sair de segundos daria).
      expect(expiraEm - antes).toBeGreaterThan(86_000_000);
      expect(expiraEm - antes).toBeLessThan(87_000_000);
    });

    it('401 renova o token e repete a chamada — uma vez só', async () => {
      const client = criar();
      fetchMock
        .mockResolvedValueOnce(resposta(200, LOGIN_OK)) // login inicial
        .mockResolvedValueOnce(resposta(401, { message: 'expirado' })) // a chamada
        .mockResolvedValueOnce(resposta(200, { ...LOGIN_OK, accessToken: 'access-2' })) // login novo
        .mockResolvedValueOnce(resposta(200, { id: 9 })); // a repetição

      await expect(client.get('/customers/9')).resolves.toEqual({ id: 9 });
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });

    it('401 de novo depois de renovar NÃO vira laço — sobe o erro', async () => {
      const client = criar();
      fetchMock
        .mockResolvedValueOnce(resposta(200, LOGIN_OK))
        .mockResolvedValueOnce(resposta(401, { message: 'sem permissão' }))
        .mockResolvedValueOnce(resposta(200, LOGIN_OK))
        .mockResolvedValueOnce(resposta(401, { message: 'sem permissão' }));

      await expect(client.get('/customers')).rejects.toMatchObject({ status: 401 });
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });

    it('refresh recusado cai para login novo, em vez de ficar sem token', async () => {
      // Token vencido no Redis: força a renovação já na primeira chamada.
      redis.dados.set(
        'pay:tokens',
        JSON.stringify({ accessToken: 'velho', refreshToken: 'refresh-velho', expiraEm: 1000 }),
      );
      const client = criar();
      fetchMock
        .mockResolvedValueOnce(resposta(401, { message: 'refresh já usado' })) // rotação perdida
        .mockResolvedValueOnce(resposta(200, LOGIN_OK)) // login de recuperação
        .mockResolvedValueOnce(resposta(200, { id: 1 }));

      await expect(client.get('/customers/1')).resolves.toEqual({ id: 1 });
      expect(urls()[0]).toContain('/auth/refresh');
      expect(urls()[1]).toContain('/auth/login');
    });
  });

  describe('retry', () => {
    it('tenta de novo em 5xx e devolve o sucesso da segunda tentativa', async () => {
      const client = criar();
      comLoginE(resposta(503, { message: 'indisponível' }), resposta(200, { id: 1 }));

      await expect(client.get('/customers/1')).resolves.toEqual({ id: 1 });
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('tenta de novo em falha de rede', async () => {
      const client = criar();
      fetchMock
        .mockResolvedValueOnce(resposta(200, LOGIN_OK))
        .mockRejectedValueOnce(new Error('ECONNRESET'))
        .mockResolvedValueOnce(resposta(200, { id: 1 }));

      await expect(client.get('/customers/1')).resolves.toEqual({ id: 1 });
    });

    it('desiste depois de 3 tentativas', async () => {
      const client = criar();
      comLoginE(resposta(500, {}), resposta(500, {}), resposta(500, {}));

      await expect(client.get('/customers')).rejects.toMatchObject({ status: 500 });
      expect(fetchMock).toHaveBeenCalledTimes(4); // login + 3
    });

    it('NÃO tenta de novo em 400 — payload errado não melhora com insistência', async () => {
      const client = criar();
      comLoginE(resposta(400, { message: 'Documento já cadastrado' }));

      await expect(client.post('/customers', {})).rejects.toMatchObject({
        status: 400,
        message: 'Documento já cadastrado',
      });
      expect(fetchMock).toHaveBeenCalledTimes(2); // login + 1
    });

    it('NÃO tenta de novo em 409 — quem decide o que fazer com ele é o chamador', async () => {
      const client = criar();
      comLoginE(resposta(409, { message: 'idempotência' }));

      // 409 é a resposta certa de um retry que deu certo. Insistir aqui
      // esconderia a cobrança que já existe do outro lado.
      await expect(client.post('/charges/undefined', {})).rejects.toMatchObject({ status: 409 });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('NÃO tenta de novo em 422', async () => {
      const client = criar();
      comLoginE(resposta(422, { message: 'cupom expirado' }));

      await expect(client.post('/charges/undefined', {})).rejects.toMatchObject({ status: 422 });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('timeout e disjuntor', () => {
    it('timeout vira erro de rede (status 0), que é transitório', async () => {
      const client = criar();
      const timeout = Object.assign(new Error('tempo'), { name: 'TimeoutError' });
      fetchMock
        .mockResolvedValueOnce(resposta(200, LOGIN_OK))
        .mockRejectedValueOnce(timeout)
        .mockRejectedValueOnce(timeout)
        .mockRejectedValueOnce(timeout);

      const erro = await client.get('/customers').catch((e: PaymentApiError) => e);
      expect(erro).toBeInstanceOf(PaymentApiError);
      expect((erro as PaymentApiError).status).toBe(0);
      expect((erro as PaymentApiError).transitorio).toBe(true);
      expect((erro as PaymentApiError).message).toMatch(/não respondeu em 5000ms/i);
    });

    it('depois de 5 falhas seguidas o disjuntor abre e a chamada nem sai', async () => {
      const client = criar();
      fetchMock.mockResolvedValue(resposta(500, {}));
      // O login também responderia 500; publica um token válido direto.
      redis.dados.set(
        'pay:tokens',
        JSON.stringify({ accessToken: 'ok', refreshToken: 'r', expiraEm: Date.now() + 86_400_000 }),
      );

      // 2 chamadas × 3 tentativas = 6 falhas: passa das 5 que abrem o circuito.
      await expect(client.get('/a')).rejects.toBeDefined();
      await expect(client.get('/b')).rejects.toBeDefined();
      const chamadasAntes = fetchMock.mock.calls.length;

      await expect(client.get('/c')).rejects.toThrow(/disjuntor aberto/i);
      expect(fetchMock.mock.calls.length).toBe(chamadasAntes);
    });

    it('4xx não conta para o disjuntor — o gateway está de pé, o payload é que não', async () => {
      const client = criar();
      redis.dados.set(
        'pay:tokens',
        JSON.stringify({ accessToken: 'ok', refreshToken: 'r', expiraEm: Date.now() + 86_400_000 }),
      );
      fetchMock.mockResolvedValue(resposta(400, { message: 'inválido' }));

      for (let i = 0; i < 6; i++) {
        await expect(client.post('/customers', {})).rejects.toMatchObject({ status: 400 });
      }

      // Se contasse, esta sétima nem sairia — e um cadastro errado teria
      // derrubado a emissão de todos os outros clientes.
      expect(fetchMock).toHaveBeenCalledTimes(6);
      await expect(client.post('/customers', {})).rejects.toMatchObject({ status: 400 });
    });
  });

  describe('idempotência', () => {
    it('manda o Idempotency-Key quando ele é passado', async () => {
      const client = criar();
      comLoginE(resposta(200, {}));

      await client.post('/charges/undefined', { value: 10 }, 'chave-fixa');

      const headers = fetchMock.mock.calls[1][1].headers as Record<string, string>;
      expect(headers['Idempotency-Key']).toBe('chave-fixa');
    });

    it('não manda o header quando não há chave — GET não é criação', async () => {
      const client = criar();
      comLoginE(resposta(200, {}));

      await client.get('/customers');

      const headers = fetchMock.mock.calls[1][1].headers as Record<string, string>;
      expect(headers['Idempotency-Key']).toBeUndefined();
    });
  });
});
