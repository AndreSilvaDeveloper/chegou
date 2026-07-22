CREATE TABLE notificacoes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  tipo            VARCHAR(30) NOT NULL CHECK (tipo IN ('encomenda','cobranca_vaga','cobranca_condominio','aviso','lembrete')),
  prioridade      INTEGER NOT NULL DEFAULT 5 CHECK (prioridade BETWEEN 1 AND 10),
  destinatario_telefone VARCHAR(20) NOT NULL,
  destinatario_nome     VARCHAR(200),
  morador_id      UUID REFERENCES moradores(id) ON DELETE SET NULL,
  referencia_tipo VARCHAR(40),
  referencia_id   UUID,
  conteudo        TEXT NOT NULL,
  variaveis_json  JSONB DEFAULT '{}'::jsonb,
  status          VARCHAR(20) NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','agendada','enviando','enviada','falha','cancelada')),
  agendada_para   TIMESTAMPTZ,
  enviada_at      TIMESTAMPTZ,
  tentativas      INTEGER NOT NULL DEFAULT 0,
  max_tentativas  INTEGER NOT NULL DEFAULT 3,
  erro_mensagem   TEXT,
  whatsapp_message_id UUID REFERENCES whatsapp_messages(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notif_tenant_status ON notificacoes(tenant_id, status);
CREATE INDEX idx_notif_agendada      ON notificacoes(agendada_para) WHERE status IN ('pendente','agendada');
CREATE INDEX idx_notif_tipo          ON notificacoes(tipo, created_at DESC);

CREATE TRIGGER trg_notificacoes_updated_at
BEFORE UPDATE ON notificacoes FOR EACH ROW EXECUTE FUNCTION set_updated_at();
