import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { SmsGateway } from '../src/modules/whatsapp/gateway/sms.gateway';
import { WHATSAPP_GATEWAY } from '../src/modules/whatsapp/gateway/whatsapp.gateway';

const noopGateway = {
  provider: 'twilio',
  sendText: jest.fn().mockResolvedValue({ providerMessageId: 'SMnoop', rawResponse: {} }),
  sendTemplate: jest.fn().mockResolvedValue({ providerMessageId: 'SMnoop', rawResponse: {} }),
  verifyInboundSignature: jest.fn().mockReturnValue(true),
  parseInboundMessage: jest.fn().mockReturnValue(null),
  parseStatusUpdate: jest.fn().mockReturnValue(null),
};

const noopSms = { isConfigured: false, sendSms: jest.fn() };

describe('Encomendas (e2e)', () => {
  let app: INestApplication;
  let porteiroToken: string;
  let apartamentoId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(WHATSAPP_GATEWAY).useValue(noopGateway)
      .overrideProvider(SmsGateway).useValue(noopSms)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.setGlobalPrefix('api');
    await app.init();

    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'porteiro@bela-vista.app', senha: 'senha123' });
    porteiroToken = loginRes.body.accessToken;

    const aptos = await request(app.getHttpServer())
      .get('/api/apartamentos?q=A-101')
      .set('Authorization', `Bearer ${porteiroToken}`);
    apartamentoId = aptos.body[0].id;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('fluxo: criar → tentar retirar com código errado → retirar com correto → bloqueio em segunda retirada', async () => {
    const criar = await request(app.getHttpServer())
      .post('/api/encomendas')
      .set('Authorization', `Bearer ${porteiroToken}`)
      .send({ apartamentoId, descricao: 'Pacote e2e' });

    expect(criar.status).toBe(201);
    expect(criar.body.codigoRetirada).toMatch(/^\d{4}$/);
    expect(criar.body.status).toBe('aguardando');

    const ret400 = await request(app.getHttpServer())
      .post(`/api/encomendas/${criar.body.id}/retirar`)
      .set('Authorization', `Bearer ${porteiroToken}`)
      .send({ codigoRetirada: '0000' });
    expect(ret400.status).toBe(400);

    const ret = await request(app.getHttpServer())
      .post(`/api/encomendas/${criar.body.id}/retirar`)
      .set('Authorization', `Bearer ${porteiroToken}`)
      .send({ codigoRetirada: criar.body.codigoRetirada });
    expect(ret.status).toBe(200);
    expect(ret.body.status).toBe('retirada');

    const ret409 = await request(app.getHttpServer())
      .post(`/api/encomendas/${criar.body.id}/retirar`)
      .set('Authorization', `Bearer ${porteiroToken}`)
      .send({ codigoRetirada: criar.body.codigoRetirada });
    expect(ret409.status).toBe(409);
  });

  it('rota exige JWT', async () => {
    const r = await request(app.getHttpServer()).get('/api/encomendas');
    expect(r.status).toBe(401);
  });

  it('superadmin não consegue criar encomenda (sem tenant)', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'admin@portaria.app', senha: 'senha123' });
    const r = await request(app.getHttpServer())
      .post('/api/encomendas')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ apartamentoId });
    expect(r.status).toBe(403);
  });
});
