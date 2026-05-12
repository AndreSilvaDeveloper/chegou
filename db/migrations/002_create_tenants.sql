-- Condomínios (tenants do SaaS)
CREATE TABLE tenants (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  nome              VARCHAR(200) NOT NULL,
  slug              VARCHAR(80)  NOT NULL UNIQUE,
  cnpj              VARCHAR(14)  UNIQUE,
  endereco          TEXT,
  cidade            VARCHAR(120),
  estado            CHAR(2),
  cep               VARCHAR(8),
  telefone_contato  VARCHAR(20),
  email_contato     CITEXT,
  plano             VARCHAR(40)  NOT NULL DEFAULT 'basico',
  ativo             BOOLEAN      NOT NULL DEFAULT true,
  -- número de origem do WhatsApp do condomínio (NULL = usa o número compartilhado da plataforma)
  whatsapp_numero   VARCHAR(20),
  config_json       JSONB        NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_tenants_estado CHECK (estado IS NULL OR estado ~ '^[A-Z]{2}$'),
  CONSTRAINT chk_tenants_cnpj   CHECK (cnpj   IS NULL OR cnpj   ~ '^\d{14}$'),
  CONSTRAINT chk_tenants_cep    CHECK (cep    IS NULL OR cep    ~ '^\d{8}$')
);

CREATE INDEX idx_tenants_ativo ON tenants(ativo) WHERE ativo = true;

CREATE TRIGGER trg_tenants_updated_at
BEFORE UPDATE ON tenants
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
