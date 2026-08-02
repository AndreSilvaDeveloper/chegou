import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'staging', 'production').default('development'),
  PORT: Joi.number().port().default(3000),
  LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'debug', 'verbose').default('info'),

  DATABASE_URL: Joi.string().uri({ scheme: ['postgresql', 'postgres'] }).required(),
  DATABASE_POOL_SIZE: Joi.number().integer().min(1).max(100).default(10),

  REDIS_URL: Joi.string().uri({ scheme: ['redis', 'rediss'] }).required(),

  // ---- Worker de disparo (fila de notificações) ----
  // false numa réplica que só atende HTTP: sem isso, escalar a API na
  // horizontal multiplica os workers e o ritmo de envio sai do controle.
  WORKER_ENABLED: Joi.boolean().default(true),
  // Jobs simultâneos no worker. A serialização que protege o número é por
  // condomínio (trava no Redis), então isto é quantos CONDOMÍNIOS diferentes
  // podem estar enviando ao mesmo tempo.
  NOTIFICATION_CONCURRENCY: Joi.number().integer().min(1).max(200).default(15),

  JWT_SECRET: Joi.string().min(16).required(),
  JWT_EXPIRES_IN: Joi.string().default('12h'),
  BCRYPT_ROUNDS: Joi.number().integer().min(8).max(15).default(12),

  // WhatsApp: só o gateway próprio (OpenWA), uma sessão por condomínio.
  // Não há mais provedor terceirizado nem número global — o número é da sessão.
  WEBHOOK_BASE_URL: Joi.string().uri().allow('').optional(),

  // ---- OpenWA (gateway WhatsApp multi-sessão, 1 instância por condomínio) ----
  // Vazio = integração desligada (dev sem gateway continua funcionando).
  OPENWA_BASE_URL: Joi.string().uri().allow('').optional(),
  OPENWA_API_KEY: Joi.string().allow('').optional(),
  // Prefixo do nome da sessão no gateway (evita colisão entre ambientes que compartilham o mesmo OpenWA).
  OPENWA_SESSION_PREFIX: Joi.string().pattern(/^[a-z0-9-]+$/).default('chegou'),
  // Base pública p/ registrar o webhook da sessão (fallback: WEBHOOK_BASE_URL). Vazio = não registra webhook.
  OPENWA_WEBHOOK_BASE_URL: Joi.string().uri().allow('').optional(),
  // Timeout de cada chamada ao gateway. Existe para uma sessão pendurada não
  // segurar um worker (e, com ele, os envios de outros condomínios).
  OPENWA_TIMEOUT_MS: Joi.number().integer().min(1000).max(120000).default(15000),

  // ---- OCR de etiquetas (serviço PaddleOCR interno) ----
  // Vazio = leitura de etiqueta desligada. A API sobe e funciona igual; só a
  // rota de ler etiqueta responde 503. É de propósito: servidor apertado pode
  // rodar sem o container de OCR, que é o mais pesado da stack.
  OCR_BASE_URL: Joi.string().uri().allow('').optional(),
  // OCR de foto grande leva alguns segundos; o timeout do gateway WhatsApp
  // (15s) seria curto demais aqui.
  OCR_TIMEOUT_MS: Joi.number().integer().min(1000).max(120000).default(30000),

  // ---- Payment API (gateway de cobrança da assinatura) ----
  // Vazio = cobrança desligada, mesma disciplina do OPENWA_BASE_URL: dev e
  // teste rodam sem gateway, a fatura continua sendo gerada e a emissão fica
  // marcada como desligada. Nada de mock silencioso — a tela diz o estado.
  PAYMENT_API_BASE_URL: Joi.string().uri().allow('').optional(),
  // `X-Company-Id` — somos UMA company lá dentro, fixa.
  PAYMENT_API_COMPANY_ID: Joi.string().allow('').optional(),
  // Usuário de integração criado no painel da Payment API, papel COMPANY_ADMIN
  // (OPERATOR não pode estornar nem dar received-in-cash, que a fase 3 usa).
  PAYMENT_API_EMAIL: Joi.string().allow('').optional(),
  PAYMENT_API_PASSWORD: Joi.string().allow('').optional(),
  // Timeout de cada chamada. Existe pelo mesmo motivo do OpenWA: chamada
  // pendurada segura um worker, e worker preso é fila parada.
  PAYMENT_API_TIMEOUT_MS: Joi.number().integer().min(1000).max(120000).default(15000),
  // Segredo que validamos no NOSSO webhook — o mesmo cadastrado no painel deles.
  // Vazio = a rota `/webhooks/pagamentos` **recusa tudo**. É de propósito: um
  // endpoint público que altera estado de fatura não pode ficar aberto porque
  // alguém esqueceu de preencher uma variável.
  PAYMENT_WEBHOOK_TOKEN: Joi.string().allow('').optional(),
  // ---- Bloqueio por inadimplência ----
  // **Padrão `false`, e isso não é timidez.** Este é o único interruptor que
  // pode tirar clientes adimplentes do ar por engano, e ligá-lo junto com o
  // deploy do código faria o bloqueio começar a valer no mesmo instante em que
  // ele passa a existir — sem ninguém ter conferido a política do gateway, os
  // clientes sincronizados nem as faturas em aberto. Liga-se de propósito, num
  // segundo momento, e desliga-se sem deploy quando alguma coisa der errado.
  PAYMENT_BLOQUEIO_ATIVO: Joi.boolean().default(false),

  STORAGE_ENDPOINT: Joi.string().allow('').optional(),
  STORAGE_BUCKET: Joi.string().allow('').optional(),
  STORAGE_REGION: Joi.string().default('us-east-1'),
  STORAGE_ACCESS_KEY: Joi.string().allow('').optional(),
  STORAGE_SECRET_KEY: Joi.string().allow('').optional(),
  STORAGE_PUBLIC_URL: Joi.string().allow('').optional(),
});
