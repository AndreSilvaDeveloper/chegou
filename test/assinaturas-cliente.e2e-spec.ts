import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { corpoCondominio } from './helpers/condominio';

/**
 * A assinatura vista pelo cliente — e quem **não** pode vê-la.
 *
 * A conta do cliente é dinheiro: a pergunta que cada teste faz é "esse usuário
 * consegue enxergar a fatura de outro?". O cenário é o mínimo que expõe isso:
 *
 *   Administradora A ─── Condomínio A1 (síndico)   → paga pela carteira
 *   Administradora B ─── Condomínio B1             → o vizinho, para comparar
 *   Condomínio Direto ─── (síndico + porteiro)     → paga o próprio
 */

const SENHA = 'senha123';

/** Competência distante: a geração varre o banco, não pode esbarrar em dado real. */
const COMPETENCIA = '2098-01';

describe('Assinatura — a conta do cliente (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let ds: DataSource;

  const sufixo = Date.now().toString(36);

  let superToken: string;
  let adminAToken: string;
  let adminBToken: string;
  let sindicoA1Token: string;
  let sindicoDiretoToken: string;
  let porteiroDiretoToken: string;

  let administradoraA: string;
  let administradoraB: string;
  let condA1: string;
  let condB1: string;
  let condDireto: string;

  const criados = { tenants: [] as string[], administradoras: [] as string[] };

  const login = async (email: string): Promise<string> => {
    const res = await http.post('/api/auth/login').send({ email, senha: SENHA });
    expect(res.status).toBe(200);
    return res.body.accessToken;
  };

  const criarAdministradora = async (apelido: string): Promise<string> => {
    const res = await http
      .post('/api/admin/administradoras')
      .set('Authorization', `Bearer ${superToken}`)
      .send({ nome: `E2E Assin ${apelido} ${sufixo}` });
    expect(res.status).toBe(201);
    criados.administradoras.push(res.body.id);
    return res.body.id;
  };

  /** Condomínio com síndico. Sem `administradoraId`, nasce direto com a plataforma. */
  const criarCondominio = async (apelido: string, administradoraId?: string): Promise<string> => {
    const rota = administradoraId
      ? `/api/admin/administradoras/${administradoraId}/condominios`
      : '/api/admin/tenants';
    const res = await http
      .post(rota)
      .set('Authorization', `Bearer ${superToken}`)
      .send(
        corpoCondominio({
          nome: `E2E Assin ${apelido} ${sufixo}`,
          slug: `e2e-assin-${apelido.toLowerCase()}-${sufixo}`,
          sindicoNome: `Síndico ${apelido}`,
          sindicoEmail: `sindico-assin-${apelido.toLowerCase()}-${sufixo}@e2e.test`,
          sindicoSenha: SENHA,
        }),
      );
    expect(res.status).toBe(201);
    criados.tenants.push(res.body.id);
    return res.body.id;
  };

  const criarUsuarioDaCarteira = async (administradoraId: string, apelido: string) => {
    const res = await http
      .post(`/api/admin/administradoras/${administradoraId}/usuarios`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({
        nome: `Admin ${apelido}`,
        email: `admin-assin-${apelido.toLowerCase()}-${sufixo}@e2e.test`,
        senha: SENHA,
      });
    expect(res.status).toBe(201);
  };

  const criarApartamentos = async (tenantId: string, quantidade: number) => {
    const valores = Array.from({ length: quantidade }, (_, i) => `('${tenantId}', '${i + 1}', true)`);
    await ds.query(`INSERT INTO apartamentos (tenant_id, numero, ativo) VALUES ${valores.join(',')}`);
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.setGlobalPrefix('api');
    await app.init();
    http = request(app.getHttpServer());
    ds = app.get(DataSource);

    superToken = await login('admin@portaria.app');

    administradoraA = await criarAdministradora('A');
    administradoraB = await criarAdministradora('B');
    condA1 = await criarCondominio('A1', administradoraA);
    condB1 = await criarCondominio('B1', administradoraB);
    condDireto = await criarCondominio('D');

    await criarApartamentos(condA1, 12);
    await criarApartamentos(condB1, 8);
    await criarApartamentos(condDireto, 20);

    await criarUsuarioDaCarteira(administradoraA, 'A');
    await criarUsuarioDaCarteira(administradoraB, 'B');

    adminAToken = await login(`admin-assin-a-${sufixo}@e2e.test`);
    adminBToken = await login(`admin-assin-b-${sufixo}@e2e.test`);
    sindicoA1Token = await login(`sindico-assin-a1-${sufixo}@e2e.test`);
    sindicoDiretoToken = await login(`sindico-assin-d-${sufixo}@e2e.test`);

    // Porteiro do condomínio direto — para provar que ele não vê a conta.
    const porteiro = await http
      .post('/api/usuarios')
      .set('Authorization', `Bearer ${sindicoDiretoToken}`)
      .send({
        nome: 'Porteiro D',
        email: `porteiro-assin-d-${sufixo}@e2e.test`,
        senha: SENHA,
        role: 'porteiro',
      });
    expect(porteiro.status).toBe(201);
    porteiroDiretoToken = await login(`porteiro-assin-d-${sufixo}@e2e.test`);

    const gerar = await http
      .post('/api/admin/assinaturas/faturas/gerar')
      .set('Authorization', `Bearer ${superToken}`)
      .send({ competencia: COMPETENCIA });
    expect(gerar.status).toBe(201);
  });

  afterAll(async () => {
    if (ds?.isInitialized) {
      await ds.query('DELETE FROM assinatura_faturas WHERE competencia = $1', [`${COMPETENCIA}-01`]);
      for (const id of criados.tenants) {
        await ds.query('DELETE FROM tenants WHERE id = $1', [id]);
      }
      for (const id of criados.administradoras) {
        // `users.administradora_id` é RESTRICT: o acesso da carteira sai antes
        // dela. (Nos condomínios o usuário cai por CASCADE do `tenant_id`.)
        await ds.query('DELETE FROM users WHERE administradora_id = $1', [id]);
        await ds.query('DELETE FROM administradoras WHERE id = $1', [id]);
      }
    }
    await app?.close();
  });

  // ------------------------------------------------------------ administradora

  describe('administradora', () => {
    it('vê a conta da carteira, com um item por condomínio', async () => {
      const res = await http
        .get('/api/minha-administradora/assinatura')
        .set('Authorization', `Bearer ${adminAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.conta.sacado.id).toBe(administradoraA);
      expect(res.body.conta.resultado.quantidadeApartamentos).toBe(12);
      expect(res.body.faturas).toHaveLength(1);
      expect(res.body.faturas[0].itens).toHaveLength(1);
    });

    it('não enxerga a fatura da administradora vizinha', async () => {
      const daB = await http
        .get('/api/minha-administradora/assinatura')
        .set('Authorization', `Bearer ${adminBToken}`);
      const faturaDeB = daB.body.faturas[0].id;

      const res = await http
        .get(`/api/minha-administradora/assinatura/faturas/${faturaDeB}`)
        .set('Authorization', `Bearer ${adminAToken}`);

      // 404 e não 403: quem não é dono não pode nem descobrir que ela existe.
      expect(res.status).toBe(404);
    });

    it('abre a própria fatura pelo id', async () => {
      const conta = await http
        .get('/api/minha-administradora/assinatura')
        .set('Authorization', `Bearer ${adminAToken}`);

      const res = await http
        .get(`/api/minha-administradora/assinatura/faturas/${conta.body.faturas[0].id}`)
        .set('Authorization', `Bearer ${adminAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.administradoraId).toBe(administradoraA);
    });
  });

  // -------------------------------------------------------------------- síndico

  describe('síndico', () => {
    it('do condomínio direto vê a própria conta e as faturas', async () => {
      const res = await http
        .get('/api/assinatura')
        .set('Authorization', `Bearer ${sindicoDiretoToken}`);

      expect(res.status).toBe(200);
      expect(res.body.responsavel.via).toBe('condominio');
      expect(res.body.conta.resultado.quantidadeApartamentos).toBe(20);
      expect(res.body.faturas).toHaveLength(1);
    });

    it('do condomínio de carteira é avisado de quem paga, sem conta própria', async () => {
      const res = await http
        .get('/api/assinatura')
        .set('Authorization', `Bearer ${sindicoA1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.responsavel).toMatchObject({
        via: 'administradora',
        administradoraId: administradoraA,
      });
      expect(res.body.conta).toBeNull();
      expect(res.body.faturas).toHaveLength(0);
    });

    it('não abre a fatura da administradora do próprio condomínio', async () => {
      const daA = await http
        .get('/api/minha-administradora/assinatura')
        .set('Authorization', `Bearer ${adminAToken}`);
      const faturaDaCarteira = daA.body.faturas[0].id;

      const res = await http
        .get(`/api/assinatura/faturas/${faturaDaCarteira}`)
        .set('Authorization', `Bearer ${sindicoA1Token}`);

      expect(res.status).toBe(404);
    });

    it('não entra nas rotas de plataforma', async () => {
      const res = await http
        .get('/api/admin/assinaturas/previas')
        .set('Authorization', `Bearer ${sindicoDiretoToken}`);

      expect(res.status).toBe(403);
    });
  });

  // ------------------------------------------------------------------ porteiro

  it('o porteiro não vê a assinatura do condomínio', async () => {
    const res = await http
      .get('/api/assinatura')
      .set('Authorization', `Bearer ${porteiroDiretoToken}`);

    expect(res.status).toBe(403);
  });

  // ---------------------------------------------------- aviso de vencimento

  /**
   * Aqui a pergunta é se o aviso **chega pelo HTTP e para o dono certo**. As
   * fronteiras da régua (3 dias, no dia, atraso) são do
   * `aviso-vencimento.spec.ts`, que não depende de banco.
   *
   * As datas são literais, nunca `CURRENT_DATE`: o Postgres do container roda
   * em UTC e o produto conta os dias em São Paulo — à noite os dois discordam
   * em um dia, e o teste passaria a falhar sozinho depois das 21h.
   */
  describe('aviso de vencimento', () => {
    it('não avisa com o vencimento longe', async () => {
      const res = await http
        .get('/api/assinatura')
        .set('Authorization', `Bearer ${sindicoDiretoToken}`);

      // A competência é de 2098: o vencimento não chega nem perto.
      expect(res.body.aviso).toBeNull();
    });

    it('o síndico de condomínio de carteira nunca recebe aviso — quem paga é outro', async () => {
      const res = await http
        .get('/api/assinatura')
        .set('Authorization', `Bearer ${sindicoA1Token}`);

      expect(res.body.aviso).toBeNull();
    });

    it('avisa o dono da fatura vencida, com o total em aberto', async () => {
      await ds.query(
        `UPDATE assinatura_faturas SET vencimento = '2020-01-10'
          WHERE tenant_id = $1 AND competencia = $2`,
        [condDireto, `${COMPETENCIA}-01`],
      );

      const res = await http
        .get('/api/assinatura')
        .set('Authorization', `Bearer ${sindicoDiretoToken}`);

      expect(res.status).toBe(200);
      expect(res.body.aviso).toMatchObject({
        situacao: 'vencida',
        faturaId: res.body.faturas[0].id,
        quantidadeEmAberto: 1,
        totalEmAberto: res.body.faturas[0].valor,
      });
      expect(res.body.aviso.diasParaVencer).toBeLessThan(0);
    });

    it('o vencimento de um cliente não vaza no aviso do outro', async () => {
      const daA = await http
        .get('/api/minha-administradora/assinatura')
        .set('Authorization', `Bearer ${adminAToken}`);

      // A fatura vencida é do condomínio direto; a carteira A segue em dia.
      expect(daA.body.aviso).toBeNull();
    });
  });

  it('a administradora não entra pela rota do condomínio', async () => {
    const res = await http
      .get('/api/assinatura')
      .set('Authorization', `Bearer ${adminAToken}`)
      .set('X-Tenant-Id', condA1);

    // A conta dela é a da carteira, não a de um condomínio — a rota é do síndico.
    expect(res.status).toBe(403);
  });
});
