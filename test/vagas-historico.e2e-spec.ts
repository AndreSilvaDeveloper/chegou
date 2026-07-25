import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * Histórico da vaga: o contrato acaba, o registro do que foi cobrado e pago não.
 *
 * O cenário monta uma vaga com um contrato encerrado (com cobrança paga e
 * cobrança em aberto) e verifica que tudo continua visível depois de encerrar.
 */

describe('Vagas — histórico de locação (e2e)', () => {
  let app: INestApplication;
  let sindicoToken: string;
  let porteiroToken: string;
  let vagaId: string;
  let locacaoId: string;

  const sufixo = Date.now().toString(36).slice(-4).toUpperCase();
  const competencia = '2030-03';

  const auth = () => ({ Authorization: `Bearer ${sindicoToken}` });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.setGlobalPrefix('api');
    await app.init();

    const login = async (email: string) =>
      (await request(app.getHttpServer()).post('/api/auth/login').send({ email, senha: 'senha123' }))
        .body.accessToken as string;

    sindicoToken = await login('sindico@bela-vista.app');
    porteiroToken = await login('porteiro@bela-vista.app');

    // Vaga livre + morador do condomínio.
    const vaga = await request(app.getHttpServer())
      .post('/api/vagas')
      .set(auth())
      .send({ numero: `H${sufixo}`, tipo: 'carro' });
    expect(vaga.status).toBe(201);
    vagaId = vaga.body.id;

    const moradores = await request(app.getHttpServer()).get('/api/moradores').set(auth());
    const moradorId = moradores.body[0].id;

    const locacao = await request(app.getHttpServer())
      .post('/api/vagas-locacao')
      .set(auth())
      .send({
        vagaId,
        locatarioTipo: 'morador',
        moradorId,
        valorMensal: 250,
        diaVencimento: 10,
        dataInicio: `${competencia}-01`,
      });
    expect(locacao.status).toBe(201);
    locacaoId = locacao.body.id;

    // Duas competências: uma será paga, a outra fica em aberto.
    for (const mes of [competencia, '2030-04']) {
      const gerar = await request(app.getHttpServer())
        .post('/api/vagas-cobrancas/gerar')
        .set(auth())
        .send({ competencia: mes, locacaoIds: [locacaoId] });
      expect(gerar.status).toBe(201);
    }

    const cobrancas = await request(app.getHttpServer())
      .get(`/api/vagas-cobrancas?locacaoId=${locacaoId}`)
      .set(auth());
    const primeira = cobrancas.body.find(
      (c: { competencia: string }) => c.competencia.slice(0, 7) === competencia,
    );
    await request(app.getHttpServer())
      .post(`/api/vagas-cobrancas/${primeira.id}/pagar`)
      .set(auth())
      .send({ valorPago: 250, pagoEm: `${competencia}-09` });
  });

  afterAll(async () => {
    const ds = app?.get(DataSource);
    if (ds?.isInitialized && vagaId) {
      // Ordem obrigatória: as FKs agora são RESTRICT (é justamente o que o
      // teste de proteção verifica).
      await ds.query('DELETE FROM vagas_cobrancas WHERE locacao_id = $1', [locacaoId]);
      await ds.query('DELETE FROM vagas_locacao WHERE vaga_id = $1', [vagaId]);
      await ds.query('DELETE FROM vagas WHERE id = $1', [vagaId]);
    }
    await app?.close();
  });

  it('o histórico traz contrato, cobranças e o que foi recebido', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/vagas/${vagaId}/historico`)
      .set(auth());

    expect(res.status).toBe(200);
    expect(res.body.vaga.numero).toBe(`H${sufixo}`);
    expect(res.body.resumo).toMatchObject({
      totalContratos: 1,
      contratosVigentes: 1,
      cobrancas: 2,
      valorCobrado: 500,
      valorRecebido: 250,
      valorEmAberto: 250,
    });
    expect(res.body.locacoes[0].cobrancas).toHaveLength(2);
  });

  it('o histórico guarda o nome de quem alugou, não só o vínculo', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/vagas/${vagaId}/historico`)
      .set(auth());

    // Gravado no contrato: é o que sobrevive à remoção do cadastro do morador.
    expect(res.body.locacoes[0].locatarioNome).toBeTruthy();
  });

  it('encerrar o contrato não apaga o histórico nem perdoa a dívida', async () => {
    const encerrar = await request(app.getHttpServer())
      .post(`/api/vagas-locacao/${locacaoId}/encerrar`)
      .set(auth());
    expect(encerrar.status).toBe(201);

    const res = await request(app.getHttpServer())
      .get(`/api/vagas/${vagaId}/historico`)
      .set(auth());

    expect(res.body.resumo.totalContratos).toBe(1);
    expect(res.body.resumo.contratosVigentes).toBe(0);
    expect(res.body.locacoes[0].status).toBe('encerrada');
    // A cobrança não paga continua em aberto depois do encerramento.
    expect(res.body.resumo.valorEmAberto).toBe(250);
    expect(res.body.resumo.valorRecebido).toBe(250);
  });

  it('desativar a vaga mantém o histórico acessível', async () => {
    const desativar = await request(app.getHttpServer())
      .delete(`/api/vagas/${vagaId}`)
      .set(auth());
    expect(desativar.status).toBe(200);

    const res = await request(app.getHttpServer())
      .get(`/api/vagas/${vagaId}/historico`)
      .set(auth());

    expect(res.status).toBe(200);
    expect(res.body.vaga.situacao).toBe('inativa');
    expect(res.body.locacoes).toHaveLength(1);
  });

  it('o banco recusa apagar vaga que tem contrato — histórico é protegido', async () => {
    const ds = app.get(DataSource);
    await expect(ds.query('DELETE FROM vagas WHERE id = $1', [vagaId])).rejects.toThrow();
  });

  it('o relatório soma o histórico financeiro, incluindo contrato encerrado', async () => {
    const res = await request(app.getHttpServer()).get('/api/relatorios/vagas').set(auth());

    expect(res.status).toBe(200);
    expect(res.body.financeiro.valorRecebido).toBeGreaterThanOrEqual(250);
    expect(res.body.financeiro.valorEmAberto).toBeGreaterThanOrEqual(250);

    const daVaga = res.body.historicoPorVaga.find(
      (v: { numero: string }) => v.numero === `H${sufixo}`,
    );
    expect(daVaga).toMatchObject({ contratos: 1, recebido: 250, emAberto: 250 });
  });

  it('o porteiro não vê o histórico financeiro', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/vagas/${vagaId}/historico`)
      .set('Authorization', `Bearer ${porteiroToken}`);

    expect(res.status).toBe(403);
  });
});
