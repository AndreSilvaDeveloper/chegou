CREATE TABLE vagas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  numero          VARCHAR(20) NOT NULL,
  tipo            VARCHAR(20) NOT NULL CHECK (tipo IN ('carro','moto','grande','pcd')),
  localizacao     VARCHAR(100),
  apartamento_id  UUID REFERENCES apartamentos(id) ON DELETE SET NULL,
  observacoes     TEXT,
  ativo           BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, numero)
);

CREATE TRIGGER trg_vagas_updated_at
BEFORE UPDATE ON vagas FOR EACH ROW EXECUTE FUNCTION set_updated_at();
