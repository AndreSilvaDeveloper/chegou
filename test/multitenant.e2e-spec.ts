import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * Prova de isolamento do multitenant.
 *
 * O cenário é o mínimo que expõe todos os vazamentos possíveis: duas
 * administradoras concorrentes, uma delas com dois condomínios. Cada teste
 * pergunta a mesma coisa por um ângulo diferente — "esse usuário consegue
 * enxergar algo que não é dele?".
 *
 *   Administradora A ─┬─ Condomínio A1 (síndico + porteiro)
 *                     └─ Condomínio A2
 *   Administradora B ─── Condomínio B1
 */

const SENHA = 'senha123';
const UUID_INEXISTENTE = '00000000-0000-4000-8000-000000000000';

describe('Multitenant (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  // Sufixo por execução: a suíte roda contra o banco de dev, então slug e
  // e-mail precisam ser únicos a cada rodada.
  const sufixo = Date.now().toString(36);

  let superToken: string;
  let adminAToken: string;
  let adminBToken: string;
  let sindicoA1Token: string;

  let administradoraA: string;
  let administradoraB: string;
  let condA1: string;
  let condA2: string;
  let condB1: string;

  let aptoA1: string;
  let aptoB1: string;

  const criados: { tenants: string[]; administradoras: string[] } = {
    tenants: [],
    administradoras: [],
  };

  const login = async (email: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, senha: SENHA });
    expect(res.status).toBe(200);
    return res.body.accessToken;
  };

  const criarCondominio = async (administradoraId: string, apelido: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post(`/api/admin/administradoras/${administradoraId}/condominios`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({
        nome: `E2E ${apelido} ${sufixo}`,
        slug: `e2e-${apelido.toLowerCase()}-${sufixo}`,
        sindicoNome: `Síndico ${apelido}`,
        sindicoEmail: `sindico-${apelido.toLowerCase()}-${sufixo}@e2e.test`,
        sindicoSenha: SENHA,
      });
    expect(res.status).toBe(201);
    criados.tenants.push(res.body.id);
    return res.body.id;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.setGlobalPrefix('api');
    await app.init();
    http = request(app.getHttpServer());

    superToken = await login('admin@portaria.app');

    const criarAdministradora = async (nome: string): Promise<string> => {
      const res = await request(app.getHttpServer())
        .post('/api/admin/administradoras')
        .set('Authorization', `Bearer ${superToken}`)
        .send({ nome: `E2E ${nome} ${sufixo}` });
      expect(res.status).toBe(201);
      criados.administradoras.push(res.body.id);
      return res.body.id;
    };

    administradoraA = await criarAdministradora('Administradora A');
    administradoraB = await criarAdministradora('Administradora B');

    condA1 = await criarCondominio(administradoraA, 'A1');
    condA2 = await criarCondominio(administradoraA, 'A2');
    condB1 = await criarCondominio(administradoraB, 'B1');

    const criarUsuarioAdmin = async (administradoraId: string, apelido: string): Promise<void> => {
      const res = await request(app.getHttpServer())
        .post(`/api/admin/administradoras/${administradoraId}/usuarios`)
        .set('Authorization', `Bearer ${superToken}`)
        .send({
          nome: `Admin ${apelido}`,
          email: `admin-${apelido.toLowerCase()}-${sufixo}@e2e.test`,
          senha: SENHA,
        });
      expect(res.status).toBe(201);
    };

    await criarUsuarioAdmin(administradoraA, 'A');
    await criarUsuarioAdmin(administradoraB, 'B');

    adminAToken = await login(`admin-a-${sufixo}@e2e.test`);
    adminBToken = await login(`admin-b-${sufixo}@e2e.test`);
    sindicoA1Token = await login(`sindico-a1-${sufixo}@e2e.test`);

    // Um apartamento em cada ponta, para ter dado real para tentar vazar.
    const criarApto = async (token: string, tenantId: string | null, numero: string) => {
      const req = request(app.getHttpServer())
        .post('/api/apartamentos')
        .set('Authorization', `Bearer ${token}`);
      if (tenantId) req.set('X-Tenant-Id', tenantId);
      const res = await req.send({ numero });
      expect(res.status).toBe(201);
      return res.body.id;
    };

    aptoA1 = await criarApto(sindicoA1Token, null, '101');
    aptoB1 = await criarApto(adminBToken, condB1, '901');
  });

  afterAll(async () => {
    // Limpa o que a suíte criou — o banco de dev não deve acumular fixture.
    const ds = app?.get(DataSource);
    if (ds?.isInitialized) {
      for (const id of criados.tenants) {
        await ds.query('DELETE FROM tenants WHERE id = $1', [id]);
      }
      for (const id of criados.administradoras) {
        // Os usuários da administradora seguram a FK (ON DELETE RESTRICT, de
        // propósito) — saem antes.
        await ds.query('DELETE FROM users WHERE administradora_id = $1', [id]);
        await ds.query('DELETE FROM administradoras WHERE id = $1', [id]);
      }
    }
    await app?.close();
  });

  // ------------------------------------------------------------ a carteira

  describe('carteira da administradora', () => {
    it('enxerga só os próprios condomínios', async () => {
      const res = await http
        .get('/api/minha-administradora/condominios')
        .set('Authorization', `Bearer ${adminAToken}`);

      expect(res.status).toBe(200);
      const ids = res.body.map((t: { id: string }) => t.id);
      expect(ids).toEqual(expect.arrayContaining([condA1, condA2]));
      expect(ids).not.toContain(condB1);
    });

    it('não alcança condomínio de outra carteira nem sabendo o id', async () => {
      const res = await http
        .get(`/api/minha-administradora/condominios/${condB1}`)
        .set('Authorization', `Bearer ${adminAToken}`);

      expect(res.status).toBe(404);
    });

    it('condomínio criado pela administradora nasce na carteira dela', async () => {
      const criar = await http
        .post('/api/minha-administradora/condominios')
        .set('Authorization', `Bearer ${adminAToken}`)
        .send({
          nome: `E2E A3 ${sufixo}`,
          slug: `e2e-a3-${sufixo}`,
          sindicoNome: 'Síndico A3',
          sindicoEmail: `sindico-a3-${sufixo}@e2e.test`,
          sindicoSenha: SENHA,
        });
      expect(criar.status).toBe(201);
      criados.tenants.push(criar.body.id);

      const minha = await http
        .get('/api/minha-administradora/condominios')
        .set('Authorization', `Bearer ${adminAToken}`);
      expect(minha.body.map((t: { id: string }) => t.id)).toContain(criar.body.id);

      const daOutra = await http
        .get('/api/minha-administradora/condominios')
        .set('Authorization', `Bearer ${adminBToken}`);
      expect(daOutra.body.map((t: { id: string }) => t.id)).not.toContain(criar.body.id);
    });

    it('uma administradora não lê a carteira da outra', async () => {
      const res = await http
        .get(`/api/admin/administradoras/${administradoraA}`)
        .set('Authorization', `Bearer ${adminBToken}`);

      expect(res.status).toBe(403);
    });

    it('administradora não usa as rotas do superadmin', async () => {
      const res = await http
        .get('/api/admin/tenants')
        .set('Authorization', `Bearer ${adminAToken}`);

      expect(res.status).toBe(403);
    });
  });

  // ------------------------------- o que a administradora configura no condomínio

  /**
   * A administradora configura o **operacional** dos condomínios dela. O que
   * está de fora não é detalhe de tela: `ativo` tira o condomínio da conta da
   * assinatura, e os módulos são o que a plataforma contratou. Se algum deles
   * passar a ser aceito aqui, é aqui que a suíte grita.
   */
  describe('configuração do condomínio pela administradora', () => {
    const configurar = (token: string, tenantId: string, corpo: object) =>
      http
        .patch(`/api/minha-administradora/condominios/${tenantId}`)
        .set('Authorization', `Bearer ${token}`)
        .send(corpo);

    it('salva tipo, estrutura de blocos e janela de envio', async () => {
      const res = await configurar(adminAToken, condA2, {
        configJson: {
          tipo: 'comercial',
          estruturaBlocos: 'unico',
          horarioEnvioInicio: '09:00',
          horarioEnvioFim: '18:00',
        },
      });

      expect(res.status).toBe(200);
      expect(res.body.configJson).toMatchObject({
        tipo: 'comercial',
        estruturaBlocos: 'unico',
        horarioEnvioInicio: '09:00',
        horarioEnvioFim: '18:00',
      });
    });

    it('salvar o operacional não apaga o resto da configuração', async () => {
      // Pela mão de quem realmente liga módulo: o superadmin. Em `condA2`, não
      // em `condA1` — lá embaixo há um teste que prova o bloqueio de módulo não
      // contratado, e ligar Vagas nele o derrubaria.
      const plataforma = await http
        .patch(`/api/admin/tenants/${condA2}`)
        .set('Authorization', `Bearer ${superToken}`)
        .send({ configJson: { moduloVagas: true, whatsappLimiteDiario: 42 } });
      expect(plataforma.status).toBe(200);

      const res = await configurar(adminAToken, condA2, { configJson: { tipo: 'misto' } });

      expect(res.status).toBe(200);
      expect(res.body.configJson.tipo).toBe('misto');
      // O merge ignora chave ausente; espalhar o DTO cru zeraria estas duas.
      expect(res.body.configJson.moduloVagas).toBe(true);
      expect(res.body.configJson.whatsappLimiteDiario).toBe(42);
    });

    it('não liga módulo contratado por conta própria', async () => {
      const res = await configurar(adminAToken, condA2, { configJson: { moduloAvisos: true } });

      // 400 do `forbidNonWhitelisted`: o campo nem existe no DTO dela.
      expect(res.status).toBe(400);
    });

    it('não mexe em plano nem em ativo', async () => {
      expect((await configurar(adminAToken, condA2, { plano: 'enterprise' })).status).toBe(400);
      expect((await configurar(adminAToken, condA2, { ativo: false })).status).toBe(400);
    });

    it('não estica a janela de envio para fora da faixa anti-bloqueio', async () => {
      const res = await configurar(adminAToken, condA2, {
        configJson: { horarioEnvioInicio: '05:00', horarioEnvioFim: '23:00' },
      });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/08:00|21:00/);
    });

    it('recusa janela que termina antes de começar', async () => {
      const res = await configurar(adminAToken, condA2, {
        configJson: { horarioEnvioInicio: '18:00', horarioEnvioFim: '09:00' },
      });

      expect(res.status).toBe(400);
    });

    it('não configura condomínio de outra carteira', async () => {
      const res = await configurar(adminBToken, condA2, { configJson: { tipo: 'comercial' } });

      // 404, não 403: a de fora não confirma nem que o condomínio existe.
      expect(res.status).toBe(404);
    });

    it('o síndico não entra pela rota da carteira', async () => {
      const res = await configurar(sindicoA1Token, condA2, { configJson: { tipo: 'comercial' } });

      expect(res.status).toBe(403);
    });
  });

  // ------------------------------------------- escopo do condomínio na request

  describe('escopo por request (X-Tenant-Id)', () => {
    it('administradora opera dentro de condomínio da carteira', async () => {
      const res = await http
        .get('/api/apartamentos')
        .set('Authorization', `Bearer ${adminAToken}`)
        .set('X-Tenant-Id', condA1);

      expect(res.status).toBe(200);
      expect(res.body.map((a: { id: string }) => a.id)).toContain(aptoA1);
    });

    it('administradora é barrada em condomínio de outra carteira', async () => {
      const res = await http
        .get('/api/apartamentos')
        .set('Authorization', `Bearer ${adminAToken}`)
        .set('X-Tenant-Id', condB1);

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/carteira/i);
    });

    it('condomínio inexistente responde igual a condomínio alheio', async () => {
      const res = await http
        .get('/api/apartamentos')
        .set('Authorization', `Bearer ${adminAToken}`)
        .set('X-Tenant-Id', UUID_INEXISTENTE);

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/carteira/i);
    });

    it('administradora sem condomínio escolhido não opera às cegas', async () => {
      const res = await http
        .get('/api/apartamentos')
        .set('Authorization', `Bearer ${adminAToken}`);

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/condomínio/i);
    });

    it('header malformado é recusado', async () => {
      const res = await http
        .get('/api/apartamentos')
        .set('Authorization', `Bearer ${adminAToken}`)
        .set('X-Tenant-Id', 'nao-e-uuid');

      expect(res.status).toBe(400);
    });

    it('síndico não troca de condomínio pelo header', async () => {
      const res = await http
        .get('/api/apartamentos')
        .set('Authorization', `Bearer ${sindicoA1Token}`)
        .set('X-Tenant-Id', condA2);

      expect(res.status).toBe(403);
    });

    it('header apontando para o próprio condomínio é inofensivo', async () => {
      const res = await http
        .get('/api/apartamentos')
        .set('Authorization', `Bearer ${sindicoA1Token}`)
        .set('X-Tenant-Id', condA1);

      expect(res.status).toBe(200);
    });

    /**
     * O superadmin não entra pelas rotas de condomínio (elas pedem síndico,
     * porteiro ou administradora): ele usa /admin/tenants/:id, que é o caminho
     * de suporte e continua alcançando qualquer condomínio.
     */
    it('superadmin alcança qualquer condomínio pelas rotas de suporte', async () => {
      const res = await http
        .get(`/api/admin/tenants/${condB1}/apartamentos`)
        .set('Authorization', `Bearer ${superToken}`);

      expect(res.status).toBe(200);
      expect(res.body.map((a: { id: string }) => a.id)).toContain(aptoB1);
    });

    it('superadmin enxerga todas as administradoras', async () => {
      const res = await http
        .get('/api/admin/administradoras')
        .set('Authorization', `Bearer ${superToken}`);

      expect(res.status).toBe(200);
      const ids = res.body.map((a: { id: string }) => a.id);
      expect(ids).toEqual(expect.arrayContaining([administradoraA, administradoraB]));
    });

    it('rota de condomínio recusa o superadmin mesmo com condomínio escolhido', async () => {
      const res = await http
        .get('/api/apartamentos')
        .set('Authorization', `Bearer ${superToken}`)
        .set('X-Tenant-Id', condB1);

      expect(res.status).toBe(403);
    });
  });

  // -------------------------------------------------- isolamento dos dados

  describe('dados de um condomínio não aparecem em outro', () => {
    it('listagem do síndico traz só o próprio condomínio', async () => {
      const res = await http
        .get('/api/apartamentos')
        .set('Authorization', `Bearer ${sindicoA1Token}`);

      expect(res.status).toBe(200);
      const ids = res.body.map((a: { id: string }) => a.id);
      expect(ids).toContain(aptoA1);
      expect(ids).not.toContain(aptoB1);
    });

    it('buscar por id um registro de outro condomínio dá 404', async () => {
      const res = await http
        .get(`/api/apartamentos/${aptoB1}`)
        .set('Authorization', `Bearer ${sindicoA1Token}`);

      expect(res.status).toBe(404);
    });

    it('administradora não alcança registro alheio nem com o condomínio certo no header', async () => {
      const res = await http
        .get(`/api/apartamentos/${aptoB1}`)
        .set('Authorization', `Bearer ${adminAToken}`)
        .set('X-Tenant-Id', condA1);

      expect(res.status).toBe(404);
    });

    it('editar registro de outro condomínio dá 404', async () => {
      const res = await http
        .patch(`/api/apartamentos/${aptoB1}`)
        .set('Authorization', `Bearer ${sindicoA1Token}`)
        .send({ observacoes: 'invasão' });

      expect(res.status).toBe(404);
    });

    it('módulo não contratado é bloqueado mesmo com escopo válido', async () => {
      const res = await http
        .get('/api/vagas')
        .set('Authorization', `Bearer ${adminAToken}`)
        .set('X-Tenant-Id', condA1);

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/módulo/i);
    });
  });

  // ------------------------------------------------------------- usuários

  describe('gestão de usuários', () => {
    it('administradora cria síndico/porteiro no condomínio da carteira', async () => {
      const res = await http
        .post('/api/usuarios')
        .set('Authorization', `Bearer ${adminAToken}`)
        .set('X-Tenant-Id', condA1)
        .send({
          nome: 'Porteiro criado pela administradora',
          email: `porteiro-a1-${sufixo}@e2e.test`,
          senha: SENHA,
          role: 'porteiro',
        });

      expect(res.status).toBe(201);
      expect(res.body.tenantId).toBe(condA1);
    });

    it('ninguém cria administradora ou superadmin por dentro de um condomínio', async () => {
      for (const role of ['admin', 'superadmin']) {
        const res = await http
          .post('/api/usuarios')
          .set('Authorization', `Bearer ${adminAToken}`)
          .set('X-Tenant-Id', condA1)
          .send({
            nome: `Escalada ${role}`,
            email: `escalada-${role}-${sufixo}@e2e.test`,
            senha: SENHA,
            role,
          });

        expect(res.status).toBe(400);
      }
    });

    it('administradora não cria usuário em condomínio de outra carteira', async () => {
      const res = await http
        .post('/api/usuarios')
        .set('Authorization', `Bearer ${adminAToken}`)
        .set('X-Tenant-Id', condB1)
        .send({
          nome: 'Intruso',
          email: `intruso-${sufixo}@e2e.test`,
          senha: SENHA,
          role: 'porteiro',
        });

      expect(res.status).toBe(403);
    });

    it('usuários de um condomínio não aparecem para outro', async () => {
      const res = await http
        .get('/api/usuarios')
        .set('Authorization', `Bearer ${sindicoA1Token}`);

      expect(res.status).toBe(200);
      const tenants = res.body.map((u: { tenantId: string }) => u.tenantId);
      expect(new Set(tenants)).toEqual(new Set([condA1]));
    });
  });

  // ------------------------------------------------ regressão: FK cruzada

  describe('referência para registro de outro condomínio', () => {
    it('funcionário não pode ser vinculado a um login de outro condomínio', async () => {
      const usuariosB1 = await http
        .get('/api/usuarios')
        .set('Authorization', `Bearer ${adminBToken}`)
        .set('X-Tenant-Id', condB1);
      expect(usuariosB1.status).toBe(200);
      const userDeB1 = usuariosB1.body[0].id;

      const res = await http
        .post('/api/equipe')
        .set('Authorization', `Bearer ${sindicoA1Token}`)
        .send({ nome: 'Zelador', cargo: 'zelador', userId: userDeB1 });

      expect(res.status).toBe(400);
    });
  });
});
