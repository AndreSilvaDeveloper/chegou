-- Apartamentos do condomínio
CREATE TABLE apartamentos (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  bloco         VARCHAR(20),                       -- NULL para condomínios sem blocos
  numero        VARCHAR(20)  NOT NULL,
  -- Coluna gerada: facilita exibição e busca textual ("A-101", "101")
  identificador VARCHAR(80)  GENERATED ALWAYS AS (
                  CASE WHEN bloco IS NULL OR bloco = '' THEN numero
                       ELSE bloco || '-' || numero END
                ) STORED,
  observacoes   TEXT,
  ativo         BOOLEAN      NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Bloco+numero único por tenant (COALESCE trata bloco NULL como '')
CREATE UNIQUE INDEX uq_apartamentos_tenant_bloco_numero
  ON apartamentos(tenant_id, COALESCE(bloco, ''), numero);

CREATE INDEX idx_apartamentos_tenant_ativo ON apartamentos(tenant_id, ativo);
CREATE INDEX idx_apartamentos_identificador ON apartamentos(tenant_id, identificador);

CREATE TRIGGER trg_apartamentos_updated_at
BEFORE UPDATE ON apartamentos
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
