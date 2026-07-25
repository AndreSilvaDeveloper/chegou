import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * Cadastro de morador: campos obrigatórios, telefone em formato único e busca
 * de apartamento por prefixo.
 *
 * Roda contra o condomínio do seed (`residencial-bela-vista`), que tem os
 * apartamentos A-101, A-102 e B-201.
 */

describe('Moradores — obrigatórios, telefone e busca (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let apartamentoId: string;

  const sufixo = Date.now().toString(36).slice(-4);
  const criados: string[] = [];

  const criarMorador = (corpo: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post('/api/moradores')
      .set('Authorization', `Bearer ${token}`)
      .send({ apartamentoId, ...corpo });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.setGlobalPrefix('api');
    await app.init();

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'sindico@bela-vista.app', senha: 'senha123' });
    token = login.body.accessToken;

    const aptos = await request(app.getHttpServer())
      .get('/api/apartamentos?q=A-101')
      .set('Authorization', `Bearer ${token}`);
    apartamentoId = aptos.body[0].id;
  });

  afterAll(async () => {
    const ds = app?.get(DataSource);
    if (ds?.isInitialized) {
      for (const id of criados) await ds.query('DELETE FROM moradores WHERE id = $1', [id]);
    }
    await app?.close();
  });

  describe('campos obrigatórios', () => {
    it('sem telefone não cadastra — é por onde o morador é avisado', async () => {
      const res = await criarMorador({ nome: `Sem Telefone ${sufixo}` });
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body.message)).toMatch(/telefone/i);
    });

    it('sem nome não cadastra', async () => {
      const res = await criarMorador({ nome: '  ', telefoneE164: '(32) 99999-0001' });
      expect(res.status).toBe(400);
    });

    it('sem apartamento não cadastra', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/moradores')
        .set('Authorization', `Bearer ${token}`)
        .send({ nome: `Sem Apto ${sufixo}`, telefoneE164: '(32) 99999-0002' });
      expect(res.status).toBe(400);
    });
  });

  describe('telefone', () => {
    it('aceita o número mascarado e guarda em E.164', async () => {
      const res = await criarMorador({
        nome: `Mascara ${sufixo}`,
        telefoneE164: '(32) 99999-1234',
      });

      expect(res.status).toBe(201);
      criados.push(res.body.id);
      expect(res.body.telefoneE164).toBe('+5532999991234');
    });

    it('aceita quem já manda E.164', async () => {
      const res = await criarMorador({
        nome: `E164 ${sufixo}`,
        telefoneE164: '+5532988887777',
      });

      expect(res.status).toBe(201);
      criados.push(res.body.id);
      expect(res.body.telefoneE164).toBe('+5532988887777');
    });

    it('respeita número de outro país quando vem com +', async () => {
      const res = await criarMorador({
        nome: `Internacional ${sufixo}`,
        telefoneE164: '+351 912 345 678',
      });

      expect(res.status).toBe(201);
      criados.push(res.body.id);
      expect(res.body.telefoneE164).toBe('+351912345678');
    });

    it('recusa número curto demais com mensagem de campo', async () => {
      const res = await criarMorador({ nome: `Curto ${sufixo}`, telefoneE164: '99999' });
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body.message)).toMatch(/\(32\) 99999-9999/);
    });

    it('atualização também normaliza', async () => {
      const criar = await criarMorador({
        nome: `Update ${sufixo}`,
        telefoneE164: '(32) 99999-5555',
      });
      criados.push(criar.body.id);

      const res = await request(app.getHttpServer())
        .patch(`/api/moradores/${criar.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ telefoneE164: '32988884444' });

      expect(res.status).toBe(200);
      expect(res.body.telefoneE164).toBe('+5532988884444');
    });
  });

  describe('busca de apartamento por prefixo', () => {
    const identificadores = async (q: string) => {
      const res = await request(app.getHttpServer())
        .get(`/api/apartamentos?q=${encodeURIComponent(q)}`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      return (res.body as { identificador: string }[]).map((a) => a.identificador);
    };

    it('digitar o bloco traz o bloco inteiro', async () => {
      const achados = await identificadores('A');
      expect(achados).toEqual(expect.arrayContaining(['A-101', 'A-102']));
      expect(achados).not.toContain('B-201');
    });

    it('digitar o começo do número filtra pelo número', async () => {
      const achados = await identificadores('1');
      expect(achados).toEqual(expect.arrayContaining(['A-101', 'A-102']));
      // 201 não começa com 1 — "contém" traria, prefixo não.
      expect(achados).not.toContain('B-201');
    });

    it('digitar o identificador completo acha a unidade', async () => {
      expect(await identificadores('B-201')).toEqual(['B-201']);
    });
  });
});
