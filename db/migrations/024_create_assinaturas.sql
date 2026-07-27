-- Assinatura do Chegou: quanto cada cliente paga pelo sistema.
--
-- Quem é o cliente depende do vínculo do condomínio:
--   condomínio sem administradora  → o próprio condomínio paga
--   condomínio em carteira         → a administradora paga, somando a carteira
-- É o que garante que nenhum condomínio seja cobrado duas vezes.
--
-- O preço é por apartamento ativo, em faixas por quantidade. A faixa encontrada
-- vale para TODOS os apartamentos (não é escalonado por trecho).

-- ---------------------------------------------------------------------------
-- Tabela de preços da plataforma
-- ---------------------------------------------------------------------------
CREATE TABLE assinatura_faixas (
  id                 UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Quantidade máxima de apartamentos da faixa. NULL = "daí para cima".
  ate_quantidade     INTEGER       CHECK (ate_quantidade IS NULL OR ate_quantidade > 0),
  preco_apartamento  NUMERIC(10,2) NOT NULL CHECK (preco_apartamento >= 0),
  ordem              INTEGER       NOT NULL,
  created_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_assinatura_faixas_ordem ON assinatura_faixas(ordem);

CREATE TRIGGER trg_assinatura_faixas_updated_at
BEFORE UPDATE ON assinatura_faixas FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Tabela inicial acordada: 3,99 até 50 · 3,49 de 51 a 200 · 2,99 acima de 200.
INSERT INTO assinatura_faixas (ate_quantidade, preco_apartamento, ordem) VALUES
  (50,   3.99, 1),
  (200,  3.49, 2),
  (NULL, 2.99, 3);

-- ---------------------------------------------------------------------------
-- Preço especial (o que foi negociado com um cliente)
-- ---------------------------------------------------------------------------
CREATE TABLE assinatura_condicoes (
  id                   UUID          PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Vale para UM condomínio ou UMA administradora, nunca os dois.
  tenant_id            UUID          REFERENCES tenants(id)         ON DELETE CASCADE,
  administradora_id    UUID          REFERENCES administradoras(id) ON DELETE CASCADE,

  modo                 VARCHAR(20)   NOT NULL DEFAULT 'tabela'
                       CHECK (modo IN ('tabela','preco_apartamento','valor_fixo')),

  -- Usados conforme o modo (ver CHECK abaixo).
  preco_apartamento    NUMERIC(10,2) CHECK (preco_apartamento IS NULL OR preco_apartamento >= 0),
  valor_fixo           NUMERIC(10,2) CHECK (valor_fixo IS NULL OR valor_fixo >= 0),

  -- Aplicado depois, sobre qualquer um dos modos.
  desconto_percentual  NUMERIC(5,2)  CHECK (desconto_percentual IS NULL
                                            OR (desconto_percentual >= 0 AND desconto_percentual <= 100)),

  vigente_de           DATE          NOT NULL DEFAULT CURRENT_DATE,
  vigente_ate          DATE,
  -- Por que este cliente paga diferente. Daqui a um ano ninguém lembra.
  observacao           TEXT,
  ativo                BOOLEAN       NOT NULL DEFAULT true,
  created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_assinatura_condicoes_dono CHECK (
    (tenant_id IS NOT NULL AND administradora_id IS NULL) OR
    (tenant_id IS NULL AND administradora_id IS NOT NULL)
  ),
  -- O modo exige o campo que ele usa: condição pela metade viraria fatura zerada.
  CONSTRAINT chk_assinatura_condicoes_modo CHECK (
    (modo = 'tabela') OR
    (modo = 'preco_apartamento' AND preco_apartamento IS NOT NULL) OR
    (modo = 'valor_fixo'        AND valor_fixo IS NOT NULL)
  ),
  CONSTRAINT chk_assinatura_condicoes_vigencia CHECK (
    vigente_ate IS NULL OR vigente_ate >= vigente_de
  )
);

-- Uma condição em aberto por cliente. Histórico (com vigente_ate) pode ter vários.
CREATE UNIQUE INDEX uq_assinatura_condicoes_tenant_vigente
  ON assinatura_condicoes(tenant_id) WHERE ativo AND vigente_ate IS NULL AND tenant_id IS NOT NULL;
CREATE UNIQUE INDEX uq_assinatura_condicoes_adm_vigente
  ON assinatura_condicoes(administradora_id) WHERE ativo AND vigente_ate IS NULL AND administradora_id IS NOT NULL;

CREATE TRIGGER trg_assinatura_condicoes_updated_at
BEFORE UPDATE ON assinatura_condicoes FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Fatura mensal
-- ---------------------------------------------------------------------------
-- ATENÇÃO: `tenant_id` aqui é NULLABLE de propósito — é a terceira exceção
-- deliberada do projeto (junto de audit_log e whatsapp_messages). A fatura da
-- administradora não pertence a condomínio nenhum; quem segura o isolamento é
-- o CHECK abaixo.
CREATE TABLE assinatura_faturas (
  id                       UUID          PRIMARY KEY DEFAULT gen_random_uuid(),

  tenant_id                UUID          REFERENCES tenants(id)         ON DELETE CASCADE,
  administradora_id        UUID          REFERENCES administradoras(id) ON DELETE CASCADE,

  -- Sempre o dia 1 do mês de referência — é a chave da idempotência.
  competencia              DATE          NOT NULL,

  -- Fotografia do que foi cobrado. Mudar a tabela de preços amanhã não pode
  -- reescrever o que já foi faturado.
  quantidade_apartamentos  INTEGER       NOT NULL CHECK (quantidade_apartamentos >= 0),
  modo                     VARCHAR(20)   NOT NULL
                           CHECK (modo IN ('tabela','preco_apartamento','valor_fixo')),
  preco_aplicado           NUMERIC(10,2) CHECK (preco_aplicado IS NULL OR preco_aplicado >= 0),
  valor_bruto              NUMERIC(10,2) NOT NULL CHECK (valor_bruto >= 0),
  desconto                 NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (desconto >= 0),
  valor                    NUMERIC(10,2) NOT NULL CHECK (valor >= 0),

  status                   VARCHAR(20)   NOT NULL DEFAULT 'aberta'
                           CHECK (status IN ('aberta','paga','vencida','cancelada')),
  vencimento               DATE          NOT NULL,
  paga_em                  TIMESTAMPTZ,
  forma_pagamento          VARCHAR(30),
  observacao               TEXT,

  created_at               TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_assinatura_faturas_sacado CHECK (
    (tenant_id IS NOT NULL AND administradora_id IS NULL) OR
    (tenant_id IS NULL AND administradora_id IS NOT NULL)
  ),
  CONSTRAINT chk_assinatura_faturas_competencia CHECK (EXTRACT(DAY FROM competencia) = 1),
  CONSTRAINT chk_assinatura_faturas_paga CHECK (
    (status = 'paga' AND paga_em IS NOT NULL) OR status <> 'paga'
  )
);

-- Gerar a mesma competência duas vezes não duplica a fatura.
CREATE UNIQUE INDEX uq_assinatura_faturas_tenant_competencia
  ON assinatura_faturas(tenant_id, competencia) WHERE tenant_id IS NOT NULL;
CREATE UNIQUE INDEX uq_assinatura_faturas_adm_competencia
  ON assinatura_faturas(administradora_id, competencia) WHERE administradora_id IS NOT NULL;

CREATE INDEX idx_assinatura_faturas_competencia ON assinatura_faturas(competencia DESC, status);

CREATE TRIGGER trg_assinatura_faturas_updated_at
BEFORE UPDATE ON assinatura_faturas FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Composição da fatura: um item por condomínio
-- ---------------------------------------------------------------------------
CREATE TABLE assinatura_fatura_itens (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  fatura_id        UUID          NOT NULL REFERENCES assinatura_faturas(id) ON DELETE CASCADE,

  -- SET NULL + nome gravado: excluir o condomínio não pode apagar a memória do
  -- que foi cobrado (mesma regra do locatario_nome em vagas_locacao).
  tenant_id        UUID          REFERENCES tenants(id) ON DELETE SET NULL,
  condominio_nome  VARCHAR(120)  NOT NULL,

  apartamentos     INTEGER       NOT NULL CHECK (apartamentos >= 0),
  subtotal         NUMERIC(10,2) NOT NULL CHECK (subtotal >= 0),

  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_assinatura_fatura_itens_fatura ON assinatura_fatura_itens(fatura_id);

COMMENT ON COLUMN assinatura_faturas.tenant_id
  IS 'NULL quando o sacado é a administradora — ver chk_assinatura_faturas_sacado';
COMMENT ON COLUMN assinatura_faturas.preco_aplicado
  IS 'Preço por apartamento usado nesta fatura. NULL quando o modo é valor_fixo.';
COMMENT ON COLUMN assinatura_faixas.ate_quantidade
  IS 'Limite superior da faixa (inclusive). NULL = última faixa, sem teto.';
