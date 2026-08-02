import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * O webhook de pagamento, por HTTP.
 *
 * O que se prova aqui é o que nenhum teste de unidade alcança: que a rota é
 * pública (sem JWT), que o token **é** conferido, e que o evento repetido é
 * barrado pelo **índice único do banco** — não por uma consulta antes do
 * insert, que duas entregas simultâneas atravessariam juntas.
 *
 * O `PAYMENT_WEBHOOK_TOKEN` é injetado no processo pelo próprio arquivo: sem
 * ele a rota recusa tudo, que é o comportamento correto e está coberto abaixo.
 */
describe('Webhook de pagamento (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;

  const TOKEN = 'token-de-teste-do-webhook';
  const sufixo = Date.now().toString(36).slice(-6);
  const eventoId = `evt-e2e-${sufixo}`;

  beforeAll(async () => {
    process.env.PAYMENT_WEBHOOK_TOKEN = TOKEN;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    app.setGlobalPrefix('api');
    await app.init();
    ds = app.get(DataSource);
  });

  afterAll(async () => {
    if (ds?.isInitialized) {
      await ds.query('DELETE FROM assinatura_webhook_eventos WHERE evento_id LIKE $1', [
        `%e2e-${sufixo}%`,
      ]);
      await ds.query("DELETE FROM assinatura_webhook_eventos WHERE evento_id LIKE 'ilegivel-%'");
    }
    await app?.close();
    delete process.env.PAYMENT_WEBHOOK_TOKEN;
  });

  const enviar = (corpo: unknown, token: string | null = TOKEN) => {
    const req = request(app.getHttpServer()).post('/api/webhooks/pagamentos');
    if (token !== null) req.set('x-webhook-token', token);
    return req.send(corpo as object);
  };

  it('a rota é pública — não exige JWT do Chegou', async () => {
    const res = await enviar({ id: eventoId, event: 'PAYMENT_RECEIVED', payment: {} });

    // Quem chama é outro sistema. 401 aqui significaria webhook nunca entregue.
    expect(res.status).not.toBe(401);
    expect(res.status).toBe(201);
  });

  it('sem token, recusa', async () => {
    const res = await enviar({ id: `${eventoId}-x`, event: 'X' }, null);
    expect(res.status).toBe(403);
  });

  it('com token errado, recusa', async () => {
    const res = await enviar({ id: `${eventoId}-y`, event: 'X' }, 'token-errado-mesmo-tamanho!!');
    expect(res.status).toBe(403);
  });

  it('**evento repetido é barrado pelo índice único**', async () => {
    const evento = { id: `${eventoId}-dup`, event: 'PAYMENT_RECEIVED', payment: {} };

    const primeiro = await enviar(evento);
    const segundo = await enviar(evento);

    expect(primeiro.body).toEqual({ ok: true, duplicado: false });
    expect(segundo.body).toEqual({ ok: true, duplicado: true });

    const [{ total }] = await ds.query(
      'SELECT COUNT(*)::int AS total FROM assinatura_webhook_eventos WHERE evento_id = $1',
      [evento.id],
    );
    expect(total).toBe(1);
  });

  it('evento de fatura desconhecida é registrado como ignorado, sem erro', async () => {
    const res = await enviar({
      id: `${eventoId}-orfao`,
      event: 'PAYMENT_RECEIVED',
      payment: { status: 'RECEIVED', externalReference: '11111111-1111-1111-1111-111111111111' },
    });

    expect(res.status).toBe(201);
    const [linha] = await ds.query(
      'SELECT status, detalhe FROM assinatura_webhook_eventos WHERE evento_id = $1',
      [`${eventoId}-orfao`],
    );
    // Pode ser cobrança de outro sistema na mesma company.
    expect(linha.status).toBe('ignorado');
  });

  it('corpo ilegível responde 200 e fica guardado para investigação', async () => {
    // Devolver erro faria o remetente reenviar para sempre um evento que
    // repetição nenhuma conserta.
    const res = await enviar({ formato: 'que não conhecemos' });

    expect(res.status).toBe(201);
    const [{ total }] = await ds.query(
      "SELECT COUNT(*)::int AS total FROM assinatura_webhook_eventos WHERE status = 'erro' AND evento_id LIKE 'ilegivel-%'",
    );
    expect(total).toBeGreaterThanOrEqual(1);
  });

  it('guarda o payload BRUTO, como chegou', async () => {
    const corpo = {
      id: `${eventoId}-bruto`,
      event: 'PAYMENT_RECEIVED',
      payment: { status: 'RECEIVED' },
      campoQueNaoConhecemos: { profundo: [1, 2, 3] },
    };
    await enviar(corpo);

    const [linha] = await ds.query(
      'SELECT payload FROM assinatura_webhook_eventos WHERE evento_id = $1',
      [corpo.id],
    );
    // Resumo nosso não responde "o que exatamente eles mandaram?" meses depois.
    expect(linha.payload).toEqual(corpo);
  });
});
