import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * Sincronizar cliente com o gateway, por HTTP.
 *
 * **O `ValidationPipe` aqui é o MESMO do `main.ts`** — e isso é o ponto do
 * arquivo. Um teste que monta a aplicação sem ele passa por cima de toda a
 * validação de DTO, e foi exatamente assim que *"property id should not exist"*
 * chegou em produção: a rota respondia 201 no teste e 400 no servidor.
 *
 * `forbidNonWhitelisted: true` recusa qualquer campo que o DTO não declare —
 * inclusive um param do path. Toda rota nova com `@Param()` sem chave precisa
 * declarar **todos** os params.
 */
describe('Clientes do gateway (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let superToken: string;
  const sufixo = Date.now().toString(36).slice(-5);
  let tenantId: string;
  let administradoraId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    // Igual ao main.ts. Divergir aqui é o que esconde erro de validação.
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.setGlobalPrefix('api');
    await app.init();
    ds = app.get(DataSource);

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'admin@portaria.app', senha: 'senha123' });
    superToken = login.body.accessToken;

    const [adm] = await ds.query(
      'INSERT INTO administradoras (nome, ativo) VALUES ($1, true) RETURNING id',
      [`E2E Cli ${sufixo}`],
    );
    administradoraId = adm.id;
    const [t] = await ds.query(
      `INSERT INTO tenants (nome, slug, ativo, plano) VALUES ($1, $2, true, 'basico') RETURNING id`,
      [`e2e-cli-${sufixo}`, `e2e-cli-${sufixo}`],
    );
    tenantId = t.id;
  });

  afterAll(async () => {
    if (ds?.isInitialized) {
      await ds.query('DELETE FROM assinatura_clientes_gateway WHERE tenant_id = $1', [tenantId]);
      await ds.query('DELETE FROM assinatura_clientes_gateway WHERE administradora_id = $1', [
        administradoraId,
      ]);
      await ds.query('DELETE FROM tenants WHERE id = $1', [tenantId]);
      await ds.query('DELETE FROM administradoras WHERE id = $1', [administradoraId]);
    }
    await app?.close();
  });

  const sincronizar = (tipo: string, id: string) =>
    request(app.getHttpServer())
      .post(`/api/admin/assinaturas/clientes/${tipo}/${id}/sincronizar`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({});

  it('**condomínio: não responde "property id should not exist"**', async () => {
    const res = await sincronizar('condominio', tenantId);

    // O defeito: `@Param()` sem chave entrega { tipo, id }, e o DTO só declarava
    // `tipo`. O 400 não dizia nada sobre a causa real.
    expect(res.status).not.toBe(400);
    expect(JSON.stringify(res.body)).not.toMatch(/should not exist/i);
  });

  it('administradora: idem', async () => {
    const res = await sincronizar('administradora', administradoraId);

    expect(res.status).not.toBe(400);
    expect(JSON.stringify(res.body)).not.toMatch(/should not exist/i);
  });

  it('com o gateway desligado, responde o motivo em vez de erro', async () => {
    const res = await sincronizar('condominio', tenantId);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ ok: false, motivo: 'desligada' });
  });

  it('tipo inválido é recusado com mensagem útil', async () => {
    const res = await sincronizar('sindico', tenantId);

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/condominio ou administradora/i);
  });

  it('id que não é UUID é recusado', async () => {
    const res = await sincronizar('condominio', 'nao-e-uuid');

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/id do cliente inválido/i);
  });

  it('a lista de pendências responde', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/admin/assinaturas/clientes/pendencias')
      .set('Authorization', `Bearer ${superToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('pendencias');
  });
});
