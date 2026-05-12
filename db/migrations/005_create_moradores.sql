-- Moradores vinculados a um apartamento
CREATE TABLE moradores (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  apartamento_id    UUID         NOT NULL REFERENCES apartamentos(id) ON DELETE CASCADE,
  nome              VARCHAR(200) NOT NULL,
  telefone_e164     VARCHAR(20),                       -- formato +5511999999999
  documento         VARCHAR(20),                       -- CPF
  email             CITEXT,
  principal         BOOLEAN      NOT NULL DEFAULT false,
  receber_whatsapp  BOOLEAN      NOT NULL DEFAULT true,
  ativo             BOOLEAN      NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_moradores_telefone_e164 CHECK (
    telefone_e164 IS NULL OR telefone_e164 ~ '^\+[1-9]\d{1,14}$'
  )
);

CREATE INDEX idx_moradores_tenant_apto ON moradores(tenant_id, apartamento_id);

-- Lookup reverso essencial para o webhook de WhatsApp (telefone -> morador do tenant)
CREATE INDEX idx_moradores_tenant_telefone
  ON moradores(tenant_id, telefone_e164)
  WHERE telefone_e164 IS NOT NULL AND ativo = true;

-- Apenas um morador principal ATIVO por apartamento
CREATE UNIQUE INDEX uq_moradores_apto_principal
  ON moradores(apartamento_id)
  WHERE principal = true AND ativo = true;

CREATE TRIGGER trg_moradores_updated_at
BEFORE UPDATE ON moradores
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
