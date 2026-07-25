import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * Cadastro de unidade: estrutura de blocos e vagas que pertencem ao apartamento.
 *
 * Roda contra o condomínio do seed (`residencial-bela-vista`), que tem blocos e
 * o módulo Vagas habilitado. Cada teste limpa o que criou.
 */

describe('Apartamentos — blocos e vagas da unidade (e2e)', () => {
  let app: INestApplication;
  let sindicoToken: string;
  let porteiroToken: string;

  // Sufixo por execução: a suíte roda contra o banco de dev.
  const sufixo = Date.now().toString(36).slice(-4).toUpperCase();
  const criados: { apartamentos: string[]; vagas: string[] } = { apartamentos: [], vagas: [] };

  const login = async (email: string) => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, senha: 'senha123' });
    expect(res.status).toBe(200);
    return res.body.accessToken as string;
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

    sindicoToken = await login('sindico@bela-vista.app');
    porteiroToken = await login('porteiro@bela-vista.app');
  });

  afterAll(async () => {
    const ds = app?.get(DataSource);
    if (ds?.isInitialized) {
      for (const id of criados.vagas) await ds.query('DELETE FROM vagas WHERE id = $1', [id]);
      for (const id of criados.apartamentos) {
        await ds.query('DELETE FROM vagas WHERE apartamento_id = $1', [id]);
        await ds.query('DELETE FROM apartamentos WHERE id = $1', [id]);
      }
    }
    await app?.close();
  });

  describe('estrutura de blocos', () => {
    it('o condomínio informa como organiza as unidades', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/apartamentos/estrutura')
        .set('Authorization', `Bearer ${sindicoToken}`);

      expect(res.status).toBe(200);
      expect(res.body.estruturaBlocos).toBe('multiplos');
    });

    it('com múltiplos blocos, unidade sem bloco é recusada', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/apartamentos')
        .set('Authorization', `Bearer ${sindicoToken}`)
        .send({ numero: `E2E${sufixo}` });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/bloco/i);
    });
  });

  describe('vagas que pertencem à unidade', () => {
    it('o porteiro cadastra a unidade, mas não as vagas dela', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/apartamentos')
        .set('Authorization', `Bearer ${porteiroToken}`)
        .send({
          bloco: 'E',
          numero: `P${sufixo}`,
          vagas: { novasVagas: [{ numero: `PV${sufixo}`, tipo: 'carro' }] },
        });

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/vaga/i);
    });

    it('o síndico cria a unidade e a vaga dela de uma vez', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/apartamentos')
        .set('Authorization', `Bearer ${sindicoToken}`)
        .send({
          bloco: 'E',
          numero: `S${sufixo}`,
          vagas: { novasVagas: [{ numero: `SV${sufixo}`, tipo: 'carro' }] },
        });

      expect(res.status).toBe(201);
      criados.apartamentos.push(res.body.id);

      const vagas = await request(app.getHttpServer())
        .get(`/api/apartamentos/${res.body.id}/vagas`)
        .set('Authorization', `Bearer ${sindicoToken}`);

      expect(vagas.status).toBe(200);
      expect(vagas.body).toHaveLength(1);
      expect(vagas.body[0].numero).toBe(`SV${sufixo}`);
      // Vaga do apartamento sai do pool de locação.
      expect(vagas.body[0].situacao).toBe('vinculada');
      expect(vagas.body[0].alugavel).toBe(false);
    });

    it('vaga repetida não deixa a unidade criada pela metade', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/apartamentos')
        .set('Authorization', `Bearer ${sindicoToken}`)
        .send({
          bloco: 'E',
          numero: `T${sufixo}`,
          // Mesmo número da vaga criada no teste anterior.
          vagas: { novasVagas: [{ numero: `SV${sufixo}`, tipo: 'carro' }] },
        });

      expect(res.status).toBe(409);

      const busca = await request(app.getHttpServer())
        .get(`/api/apartamentos?q=E-T${sufixo}`)
        .set('Authorization', `Bearer ${sindicoToken}`);
      expect(busca.body).toHaveLength(0);
    });

    it('desativar a unidade desativa as vagas dela, sem soltá-las para locação', async () => {
      const criar = await request(app.getHttpServer())
        .post('/api/apartamentos')
        .set('Authorization', `Bearer ${sindicoToken}`)
        .send({
          bloco: 'E',
          numero: `D${sufixo}`,
          vagas: { novasVagas: [{ numero: `DV${sufixo}`, tipo: 'moto' }] },
        });
      expect(criar.status).toBe(201);
      criados.apartamentos.push(criar.body.id);

      const desativar = await request(app.getHttpServer())
        .delete(`/api/apartamentos/${criar.body.id}`)
        .set('Authorization', `Bearer ${sindicoToken}`);
      expect(desativar.status).toBe(200);
      expect(desativar.body.vagasDesativadas).toBe(1);

      const vagas = await request(app.getHttpServer())
        .get(`/api/apartamentos/${criar.body.id}/vagas`)
        .set('Authorization', `Bearer ${sindicoToken}`);
      expect(vagas.body[0].ativo).toBe(false);
      // Continua sendo do apartamento — não caiu no pool de locação.
      expect(vagas.body[0].apartamentoId).toBe(criar.body.id);
    });

    it('desvincular devolve a vaga para o pool de locação', async () => {
      const criar = await request(app.getHttpServer())
        .post('/api/apartamentos')
        .set('Authorization', `Bearer ${sindicoToken}`)
        .send({
          bloco: 'E',
          numero: `U${sufixo}`,
          vagas: { novasVagas: [{ numero: `UV${sufixo}`, tipo: 'carro' }] },
        });
      expect(criar.status).toBe(201);
      criados.apartamentos.push(criar.body.id);
      const vagaId = (
        await request(app.getHttpServer())
          .get(`/api/apartamentos/${criar.body.id}/vagas`)
          .set('Authorization', `Bearer ${sindicoToken}`)
      ).body[0].id;
      criados.vagas.push(vagaId);

      const res = await request(app.getHttpServer())
        .delete(`/api/apartamentos/${criar.body.id}/vagas/${vagaId}`)
        .set('Authorization', `Bearer ${sindicoToken}`);

      expect(res.status).toBe(200);
      expect(res.body.situacao).toBe('livre');
      expect(res.body.alugavel).toBe(true);
    });
  });
});
