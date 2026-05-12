-- Histórico de mensagens WhatsApp (entrada + saída) — auditoria, debug e idempotência
CREATE TABLE whatsapp_messages (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID         NOT NULL REFERENCES tenants(id)    ON DELETE CASCADE,
  encomenda_id        UUID                  REFERENCES encomendas(id) ON DELETE SET NULL,
  morador_id          UUID                  REFERENCES moradores(id)  ON DELETE SET NULL,

  direction           VARCHAR(3)   NOT NULL CHECK (direction IN ('in','out')),
  provider            VARCHAR(20)  NOT NULL,                -- 'twilio' | 'zapi' | 'gupshup' | ...
  provider_message_id VARCHAR(120),                         -- ID retornado pelo BSP

  from_number         VARCHAR(20)  NOT NULL,
  to_number           VARCHAR(20)  NOT NULL,

  message_type        VARCHAR(20)  NOT NULL
                      CHECK (message_type IN ('template','text','image','interactive','system')),
  template_name       VARCHAR(80),
  body                TEXT,
  payload_json        JSONB        NOT NULL DEFAULT '{}'::jsonb,

  status              VARCHAR(20)  NOT NULL DEFAULT 'queued'
                      CHECK (status IN ('queued','sent','delivered','read','failed','received')),
  error_message       TEXT,

  -- Chave para evitar reenvio em retentativas (ex.: 'encomenda:<uuid>:notify')
  idempotency_key     VARCHAR(120),

  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Dedupe: cada provider_message_id é único por provedor (entradas via webhook)
CREATE UNIQUE INDEX uq_whatsapp_provider_msg_id
  ON whatsapp_messages(provider, provider_message_id)
  WHERE provider_message_id IS NOT NULL;

-- Garantia de idempotência: cada chave só é processada uma vez por tenant
CREATE UNIQUE INDEX uq_whatsapp_idempotency
  ON whatsapp_messages(tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX idx_whatsapp_encomenda      ON whatsapp_messages(encomenda_id);
CREATE INDEX idx_whatsapp_tenant_created ON whatsapp_messages(tenant_id, created_at DESC);

CREATE TRIGGER trg_whatsapp_updated_at
BEFORE UPDATE ON whatsapp_messages
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
