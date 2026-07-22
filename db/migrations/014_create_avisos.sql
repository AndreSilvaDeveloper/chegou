CREATE TABLE avisos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  titulo          VARCHAR(200) NOT NULL,
  conteudo        TEXT NOT NULL,
  tipo            VARCHAR(30) NOT NULL DEFAULT 'geral' CHECK (tipo IN ('geral','urgente','manutencao','evento','financeiro')),
  criado_por_id   UUID NOT NULL REFERENCES users(id),
  destinatario    VARCHAR(20) NOT NULL DEFAULT 'todos' CHECK (destinatario IN ('todos','bloco','apartamento')),
  destinatario_filtro JSONB,
  enviar_whatsapp BOOLEAN NOT NULL DEFAULT false,
  enviada_at      TIMESTAMPTZ,
  ativo           BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_avisos_tenant ON avisos(tenant_id, created_at DESC);

CREATE TRIGGER trg_avisos_updated_at
BEFORE UPDATE ON avisos FOR EACH ROW EXECUTE FUNCTION set_updated_at();
