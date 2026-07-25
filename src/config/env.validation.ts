import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'staging', 'production').default('development'),
  PORT: Joi.number().port().default(3000),
  LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'debug', 'verbose').default('info'),

  DATABASE_URL: Joi.string().uri({ scheme: ['postgresql', 'postgres'] }).required(),
  DATABASE_POOL_SIZE: Joi.number().integer().min(1).max(100).default(10),

  REDIS_URL: Joi.string().uri({ scheme: ['redis', 'rediss'] }).required(),

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

  STORAGE_ENDPOINT: Joi.string().allow('').optional(),
  STORAGE_BUCKET: Joi.string().allow('').optional(),
  STORAGE_REGION: Joi.string().default('us-east-1'),
  STORAGE_ACCESS_KEY: Joi.string().allow('').optional(),
  STORAGE_SECRET_KEY: Joi.string().allow('').optional(),
  STORAGE_PUBLIC_URL: Joi.string().allow('').optional(),
});
