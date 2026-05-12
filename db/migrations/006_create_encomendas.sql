-- Encomendas: entidade central do sistema
CREATE TABLE encomendas (
  id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID         NOT NULL REFERENCES tenants(id)       ON DELETE RESTRICT,
  apartamento_id           UUID         NOT NULL REFERENCES apartamentos(id)  ON DELETE RESTRICT,
  morador_destino_id       UUID                  REFERENCES moradores(id)     ON DELETE SET NULL,

  descricao                VARCHAR(255),
  transportadora           VARCHAR(80),
  codigo_rastreio          VARCHAR(80),
  foto_url                 TEXT,
  observacoes              TEXT,

  -- Código de 4 dígitos ditado pelo morador na portaria
  codigo_retirada          CHAR(4)      NOT NULL,

  status                   VARCHAR(20)  NOT NULL DEFAULT 'aguardando'
                           CHECK (status IN ('aguardando','notificado','retirada','cancelada','devolvida')),

  recebida_por_user_id     UUID         NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

  -- Dados da retirada (preenchidos quando status = 'retirada')
  retirada_por_morador_id  UUID         REFERENCES moradores(id) ON DELETE SET NULL,
  retirada_por_user_id     UUID         REFERENCES users(id)     ON DELETE RESTRICT,
  retirada_documento       VARCHAR(20),
  retirada_assinatura_url  TEXT,
  retirada_observacoes     TEXT,

  notificada_at            TIMESTAMPTZ,
  retirada_at              TIMESTAMPTZ,
  cancelada_at             TIMESTAMPTZ,
  cancelamento_motivo      TEXT,

  created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_encomendas_codigo_retirada CHECK (codigo_retirada ~ '^\d{4}$'),

  -- Coerência: apartamento e morador devem pertencer ao mesmo tenant (validado em app + audit)
  CONSTRAINT chk_encomendas_status_retirada CHECK (
    (status = 'retirada'   AND retirada_at   IS NOT NULL) OR (status <> 'retirada')
  ),
  CONSTRAINT chk_encomendas_status_cancelada CHECK (
    (status = 'cancelada'  AND cancelada_at  IS NOT NULL) OR (status <> 'cancelada')
  )
);

-- Código de retirada é único apenas entre encomendas ATIVAS do tenant
-- (depois de retirada/cancelada, o código pode ser reciclado)
CREATE UNIQUE INDEX uq_encomendas_codigo_ativo
  ON encomendas(tenant_id, codigo_retirada)
  WHERE status IN ('aguardando', 'notificado');

-- Listagens mais comuns na portaria
CREATE INDEX idx_encomendas_tenant_status_created
  ON encomendas(tenant_id, status, created_at DESC);

CREATE INDEX idx_encomendas_tenant_apto_status
  ON encomendas(tenant_id, apartamento_id, status);

CREATE INDEX idx_encomendas_morador_destino
  ON encomendas(morador_destino_id)
  WHERE morador_destino_id IS NOT NULL;

CREATE TRIGGER trg_encomendas_updated_at
BEFORE UPDATE ON encomendas
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
