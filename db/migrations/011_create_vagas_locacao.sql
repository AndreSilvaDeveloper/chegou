CREATE TABLE vagas_locacao (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  vaga_id         UUID NOT NULL REFERENCES vagas(id) ON DELETE CASCADE,
  morador_id      UUID REFERENCES moradores(id) ON DELETE SET NULL,
  valor_mensal    DECIMAL(10,2) NOT NULL,
  dia_vencimento  INTEGER NOT NULL CHECK (dia_vencimento BETWEEN 1 AND 31),
  data_inicio     DATE NOT NULL,
  data_fim        DATE,
  status          VARCHAR(20) NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa','encerrada','inadimplente')),
  observacoes     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_vagas_locacao_tenant ON vagas_locacao(tenant_id);
CREATE INDEX idx_vagas_locacao_vaga   ON vagas_locacao(vaga_id);

CREATE TRIGGER trg_vagas_locacao_updated_at
BEFORE UPDATE ON vagas_locacao FOR EACH ROW EXECUTE FUNCTION set_updated_at();
