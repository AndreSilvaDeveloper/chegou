-- Cobrança mensal do aluguel de vaga.
--
-- Uma linha por locação por competência (mês de referência). Hoje o registro é
-- interno e o aviso vai por WhatsApp; as colunas de provedor estão mapeadas para
-- a integração com o Asaas, que ainda NÃO está implementada.

CREATE TABLE vagas_cobrancas (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID          NOT NULL REFERENCES tenants(id)       ON DELETE CASCADE,
  locacao_id     UUID          NOT NULL REFERENCES vagas_locacao(id) ON DELETE CASCADE,

  -- Sempre o dia 1 do mês de referência — é a chave da idempotência.
  competencia    DATE          NOT NULL,
  valor          NUMERIC(10,2) NOT NULL CHECK (valor >= 0),
  vencimento     DATE          NOT NULL,

  status         VARCHAR(20)   NOT NULL DEFAULT 'pendente'
                 CHECK (status IN ('pendente','enviada','paga','vencida','cancelada')),

  -- Envio ao responsável
  notificacao_id       UUID REFERENCES notificacoes(id) ON DELETE SET NULL,
  enviada_whatsapp_at  TIMESTAMPTZ,
  enviada_email_at     TIMESTAMPTZ,

  -- Baixa (manual enquanto não há integração)
  pago_at        TIMESTAMPTZ,
  valor_pago     NUMERIC(10,2) CHECK (valor_pago IS NULL OR valor_pago >= 0),

  -- Provedor de cobrança
  provider          VARCHAR(20) NOT NULL DEFAULT 'manual'
                    CHECK (provider IN ('manual','asaas')),
  asaas_payment_id  VARCHAR(60),
  boleto_url        TEXT,
  linha_digitavel   VARCHAR(80),
  pix_copia_cola    TEXT,
  provider_payload  JSONB,

  observacoes    TEXT,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  -- Competência é sempre o primeiro dia do mês.
  CONSTRAINT chk_vagas_cobrancas_competencia CHECK (EXTRACT(DAY FROM competencia) = 1),
  -- Cobrança paga precisa registrar quando.
  CONSTRAINT chk_vagas_cobrancas_pago CHECK (
    (status = 'paga' AND pago_at IS NOT NULL) OR status <> 'paga'
  )
);

-- Impede cobrar duas vezes o mesmo mês: a geração mensal pode rodar de novo sem
-- efeito colateral.
CREATE UNIQUE INDEX uq_vagas_cobrancas_locacao_competencia
  ON vagas_cobrancas(locacao_id, competencia);

CREATE INDEX idx_vagas_cobrancas_tenant_status
  ON vagas_cobrancas(tenant_id, status, vencimento);

CREATE INDEX idx_vagas_cobrancas_tenant_competencia
  ON vagas_cobrancas(tenant_id, competencia DESC);

CREATE TRIGGER trg_vagas_cobrancas_updated_at
BEFORE UPDATE ON vagas_cobrancas
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON COLUMN vagas_cobrancas.provider
  IS 'manual = controle interno sem boleto; asaas = reservado, integração não implementada';
COMMENT ON COLUMN vagas_cobrancas.competencia
  IS 'Mês de referência (sempre dia 1). Com locacao_id forma a chave de idempotência.';
