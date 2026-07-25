-- Locação de vagas: locatário (morador ou pessoa externa), contrato assinado e
-- tabela de preços por tipo de vaga.
--
-- Regra do domínio: vaga com `apartamento_id` preenchido é de uso próprio da
-- unidade e NÃO pode ser alugada. Só vagas livres (apartamento_id IS NULL)
-- entram no pool de locação, e cada vaga tem no máximo um responsável por vez.

-- ---------------------------------------------------------------- locatário
ALTER TABLE vagas_locacao
  ADD COLUMN locatario_tipo          VARCHAR(10) NOT NULL DEFAULT 'morador',
  ADD COLUMN locatario_nome          VARCHAR(200),
  ADD COLUMN locatario_documento     VARCHAR(20),
  ADD COLUMN locatario_telefone_e164 VARCHAR(20),
  ADD COLUMN locatario_email         CITEXT;

ALTER TABLE vagas_locacao
  ADD CONSTRAINT chk_vagas_locacao_locatario_tipo
    CHECK (locatario_tipo IN ('morador', 'externo'));

-- Morador cadastrado aponta para `moradores`; externo guarda os dados na própria
-- locação e precisa de pelo menos um canal para receber a cobrança.
-- NOT VALID: locações criadas antes deste modelo (quando morador_id era opcional
-- e não havia locatário externo) não são revalidadas, mas todo INSERT/UPDATE a
-- partir daqui é verificado pelo Postgres.
ALTER TABLE vagas_locacao
  ADD CONSTRAINT chk_vagas_locacao_locatario
    CHECK (
      (locatario_tipo = 'morador' AND morador_id IS NOT NULL)
      OR
      (locatario_tipo = 'externo'
        AND locatario_nome IS NOT NULL
        AND (locatario_telefone_e164 IS NOT NULL OR locatario_email IS NOT NULL))
    ) NOT VALID;

ALTER TABLE vagas_locacao
  ADD CONSTRAINT chk_vagas_locacao_telefone_e164
    CHECK (locatario_telefone_e164 IS NULL OR locatario_telefone_e164 ~ '^\+[1-9]\d{1,14}$');

ALTER TABLE vagas_locacao
  ADD CONSTRAINT chk_vagas_locacao_periodo
    CHECK (data_fim IS NULL OR data_fim >= data_inicio) NOT VALID;

-- ---------------------------------------------------------------- contrato
ALTER TABLE vagas_locacao
  ADD COLUMN contrato_url          TEXT,
  ADD COLUMN contrato_key          TEXT,
  ADD COLUMN contrato_nome_arquivo VARCHAR(255),
  ADD COLUMN contrato_enviado_at   TIMESTAMPTZ;

-- ------------------------------------------- cobrança externa (Asaas, futuro)
-- Mapeado agora para não exigir migration quando a integração entrar.
ALTER TABLE vagas_locacao
  ADD COLUMN asaas_customer_id VARCHAR(60);

COMMENT ON COLUMN vagas_locacao.asaas_customer_id
  IS 'ID do cliente no Asaas. Reservado: a geração de cobrança ainda não está implementada.';

-- ------------------------------------------------ um responsável por vaga
-- Rede de segurança da regra "a vaga só pode ter um dono": impede duas locações
-- vigentes na mesma vaga, mesmo em requests concorrentes.
CREATE UNIQUE INDEX uq_vagas_locacao_vaga_vigente
  ON vagas_locacao(vaga_id)
  WHERE status IN ('ativa', 'inadimplente');

CREATE INDEX idx_vagas_locacao_tenant_status
  ON vagas_locacao(tenant_id, status);

-- Só vaga livre pode ser alugada — o índice acelera a listagem do pool.
CREATE INDEX idx_vagas_tenant_livres
  ON vagas(tenant_id)
  WHERE apartamento_id IS NULL AND ativo = true;

-- ------------------------------------------------------- tabela de preços
-- Valor sugerido por tipo de vaga, mantido pelo síndico. A locação guarda o
-- valor contratado em `valor_mensal`, então reajustar a tabela não altera
-- contrato vigente.
CREATE TABLE vagas_precos (
  tenant_id    UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  tipo         VARCHAR(20)   NOT NULL CHECK (tipo IN ('carro', 'moto', 'grande', 'pcd')),
  valor_mensal NUMERIC(10,2) NOT NULL CHECK (valor_mensal >= 0),
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, tipo)
);

CREATE TRIGGER trg_vagas_precos_updated_at
BEFORE UPDATE ON vagas_precos
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
