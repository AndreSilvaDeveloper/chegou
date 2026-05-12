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

  WHATSAPP_PROVIDER: Joi.string().valid('twilio', 'zapi', 'gupshup').required(),
  WHATSAPP_FROM_NUMBER: Joi.string().pattern(/^\+[1-9]\d{1,14}$/).required(),
  WHATSAPP_SANDBOX_MODE: Joi.boolean().truthy('true').falsy('false').default(false),
  WHATSAPP_WEBHOOK_VERIFY: Joi.boolean().truthy('true').falsy('false').default(true),
  WEBHOOK_BASE_URL: Joi.string().uri().allow('').optional(),

  TWILIO_ACCOUNT_SID: Joi.string().allow('').optional(),
  TWILIO_AUTH_TOKEN: Joi.string().allow('').optional(),
  TWILIO_WHATSAPP_FROM: Joi.string().allow('').optional(),
  TWILIO_SMS_FROM: Joi.string().allow('').optional(),
  TWILIO_TEMPLATE_ENCOMENDA_CHEGOU: Joi.string().allow('').optional(),
  TWILIO_TEMPLATE_RETIRADA_CONFIRMADA: Joi.string().allow('').optional(),

  ZAPI_INSTANCE_ID: Joi.string().allow('').optional(),
  ZAPI_TOKEN: Joi.string().allow('').optional(),

  STORAGE_ENDPOINT: Joi.string().allow('').optional(),
  STORAGE_BUCKET: Joi.string().allow('').optional(),
  STORAGE_REGION: Joi.string().default('us-east-1'),
  STORAGE_ACCESS_KEY: Joi.string().allow('').optional(),
  STORAGE_SECRET_KEY: Joi.string().allow('').optional(),
  STORAGE_PUBLIC_URL: Joi.string().allow('').optional(),
});
