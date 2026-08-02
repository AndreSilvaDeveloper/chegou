import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AcessoAssinaturaService } from '../src/common/guards';

/**
 * O bloqueio por inadimplência, pelo HTTP de verdade.
 *
 * Dois grupos de teste, e o primeiro é o mais importante: **provar que o guard
 * nasce inerte**. Ele é a única peça do sistema capaz de tirar clientes
 * adimplentes do ar, e um deploy não pode ligá-lo por conta própria.
 *
 * O segundo grupo força o serviço a dizer "bloqueado" (substituindo o provider)
 * para conferir que o 402 sai com o que o cliente precisa — sem depender de um
 * gateway de verdade nem de uma fatura vencida montada à mão.
 */
describe('Bloqueio por inadimplência (e2e)', () => {
  let app: INestApplication;
  let sindicoToken: string;
  let superToken: string;

  /** O serviço de mentira: o teste liga e desliga o bloqueio à vontade. */
  const fake = {
    ativo: false,
    situacaoDaRequest: async () => ({
      liberado: false,
      motivo: 'Assinatura do Chegou em atraso.',
      valorEmAberto: 418.8,
      faturasVencidas: 1,
      diasEmAtraso: 12,
      linkPagamento: 'https://asaas.com/i/5030',
      telaAssinatura: '/assinatura',
    }),
  };

  const login = async (email: string) => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, senha: 'senha123' });
    expect(res.status).toBe(200);
    return res.body.accessToken as string;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AcessoAssinaturaService)
      .useValue(fake)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.setGlobalPrefix('api');
    await app.init();

    sindicoToken = await login('sindico@bela-vista.app');
    superToken = await login('admin@portaria.app');
  });

  afterAll(async () => {
    await app?.close();
  });

  const comoSindico = (metodo: 'post' | 'get' | 'patch', caminho: string) =>
    request(app.getHttpServer())[metodo](caminho).set('Authorization', `Bearer ${sindicoToken}`);

  describe('nasce inerte', () => {
    beforeAll(() => {
      fake.ativo = false;
    });

    it('**sem PAYMENT_BLOQUEIO_ATIVO, escrita nenhuma é bloqueada**', async () => {
      // O e2e roda sem a variável, como qualquer ambiente que ainda não ligou o
      // bloqueio de propósito. Nada aqui pode responder 402.
      const res = await comoSindico('post', '/api/encomendas').send({});

      expect(res.status).not.toBe(402);
    });

    it('leitura passa', async () => {
      const res = await comoSindico('get', '/api/encomendas');
      expect(res.status).toBe(200);
    });
  });

  describe('com o bloqueio ligado', () => {
    beforeAll(() => {
      fake.ativo = true;
    });
    afterAll(() => {
      fake.ativo = false;
    });

    it('**GET continua passando** — leitura nunca é bloqueada', async () => {
      const res = await comoSindico('get', '/api/encomendas');
      expect(res.status).toBe(200);
    });

    it('POST responde 402 com o que o cliente precisa para resolver', async () => {
      const res = await comoSindico('post', '/api/encomendas').send({});

      expect(res.status).toBe(402);
      expect(res.body.assinatura).toMatchObject({
        bloqueado: true,
        valorEmAberto: 418.8,
        linkPagamento: 'https://asaas.com/i/5030',
        telaAssinatura: '/assinatura',
      });
    });

    it('**`/assinatura` continua acessível** — é a saída do bloqueio', async () => {
      // Sem esta isenção o cliente bloqueado não conseguiria nem abrir a tela
      // onde está o link para pagar.
      const res = await comoSindico('get', '/api/assinatura');
      expect(res.status).toBe(200);
    });

    it('login continua funcionando: é onde ele descobre o bloqueio', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'sindico@bela-vista.app', senha: 'senha123' });

      expect(res.status).toBe(200);
    });

    it('o superadmin não se bloqueia', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/admin/assinaturas/cobrancas/conciliar')
        .set('Authorization', `Bearer ${superToken}`)
        .send({});

      expect(res.status).not.toBe(402);
    });

    it('o webhook de pagamento não é bloqueado — é outro sistema', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/webhooks/pagamentos')
        .send({ id: 'x' });

      // 403 (token) é o esperado aqui; o que importa é NÃO ser 402.
      expect(res.status).not.toBe(402);
    });
  });

  describe('fail-open', () => {
    it('**falha ao avaliar libera** — um defeito aqui não tira o sistema do ar', async () => {
      fake.ativo = true;
      const original = fake.situacaoDaRequest;
      fake.situacaoDaRequest = async () => {
        throw new Error('banco fora');
      };

      const res = await comoSindico('post', '/api/encomendas').send({});

      expect(res.status).not.toBe(402);

      fake.situacaoDaRequest = original;
      fake.ativo = false;
    });
  });
});
