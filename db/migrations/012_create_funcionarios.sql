CREATE TABLE funcionarios (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome            VARCHAR(200) NOT NULL,
  cargo           VARCHAR(60) NOT NULL,
  telefone        VARCHAR(20),
  documento       VARCHAR(20),
  email           CITEXT,
  data_admissao   DATE,
  horario_trabalho TEXT,
  observacoes     TEXT,
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  ativo           BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_funcionarios_tenant ON funcionarios(tenant_id);

CREATE TRIGGER trg_funcionarios_updated_at
BEFORE UPDATE ON funcionarios FOR EACH ROW EXECUTE FUNCTION set_updated_at();
