-- Cupom de desconto na assinatura.
--
-- **O cupom vive no gateway, não aqui.** Lá já existe tudo: escopo, vigência,
-- limite global, limite por cliente, whitelist e a contagem de uso. Duplicar
-- isso do nosso lado criaria duas fontes da verdade que divergem no primeiro
-- erro de rede — e a que importa é a que o gateway usa para descontar.
--
-- O que guardamos é só a **atribuição**: qual cupom vale para qual cliente. E,
-- na fatura, o que foi aplicado — porque a fatura precisa se explicar sozinha
-- daqui a um ano, e "por que este mês veio 20% menor" é exatamente esse tipo de
-- pergunta.

-- ---------------------------------------------------------------------------
-- 1. A atribuição: qual cupom vale para qual cliente
-- ---------------------------------------------------------------------------
CREATE TABLE assinatura_cupom_cliente (
  id                 UUID          PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Vale para UM condomínio ou UMA administradora, como todas as tabelas de
  -- assinatura.
  tenant_id          UUID          REFERENCES tenants(id)         ON DELETE CASCADE,
  administradora_id  UUID          REFERENCES administradoras(id) ON DELETE CASCADE,

  -- O código no gateway. Guardado em caixa alta porque é assim que ele
  -- normaliza — comparar sem isso faria "desc50" nunca achar "DESC50".
  codigo             VARCHAR(60)   NOT NULL,

  -- Até que competência aplicar (YYYY-MM-01). NULL = enquanto o cupom valer
  -- no gateway. É o freio do nosso lado: o limite de uso do cupom é de lá, mas
  -- "este cliente para de receber em junho" é uma decisão comercial nossa.
  aplicar_ate        DATE,

  ativo              BOOLEAN       NOT NULL DEFAULT true,
  observacao         TEXT,

  created_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_assinatura_cupom_cliente_dono CHECK (
    (tenant_id IS NOT NULL AND administradora_id IS NULL) OR
    (tenant_id IS NULL AND administradora_id IS NOT NULL)
  )
);

-- **Um cupom em aberto por cliente** — a mesma disciplina de
-- `assinatura_condicoes`. Dois cupons ativos no mesmo cliente exigiriam uma
-- regra de desempate que ninguém lembraria seis meses depois; o histórico
-- (ativo = false) pode ter quantos precisar.
CREATE UNIQUE INDEX uq_assinatura_cupom_cliente_tenant
  ON assinatura_cupom_cliente(tenant_id) WHERE tenant_id IS NOT NULL AND ativo;
CREATE UNIQUE INDEX uq_assinatura_cupom_cliente_administradora
  ON assinatura_cupom_cliente(administradora_id) WHERE administradora_id IS NOT NULL AND ativo;

CREATE TRIGGER trg_assinatura_cupom_cliente_updated_at
BEFORE UPDATE ON assinatura_cupom_cliente FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. O que a fatura registra do cupom
-- ---------------------------------------------------------------------------
-- Sem estas duas colunas, uma fatura com cupom seria indistinguível de uma
-- fatura com preço errado: o valor viria menor e nada diria por quê.
ALTER TABLE assinatura_faturas
  ADD COLUMN cupom_codigo   VARCHAR(60),
  ADD COLUMN cupom_desconto NUMERIC(10,2) CHECK (cupom_desconto IS NULL OR cupom_desconto >= 0);

COMMENT ON TABLE assinatura_cupom_cliente IS
  'Atribuição de cupom a um cliente. O cupom em si (regras, vigência, uso) vive no gateway — aqui só quem usa qual.';
COMMENT ON COLUMN assinatura_cupom_cliente.aplicar_ate IS
  'Última competência em que o cupom é aplicado. NULL = enquanto valer no gateway.';
COMMENT ON COLUMN assinatura_faturas.cupom_desconto IS
  'Quanto o cupom tirou desta fatura. O valor JÁ está descontado em `valor`; este campo existe para a fatura se explicar.';
