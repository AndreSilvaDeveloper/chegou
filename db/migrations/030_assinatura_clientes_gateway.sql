-- O vínculo entre o nosso cliente e o `customer` do gateway de pagamento.
--
-- Quem paga o Chegou é um condomínio direto **ou** uma administradora — nunca
-- os dois, e nunca um condomínio de carteira (esse está dentro da conta dela).
-- No gateway, cada um desses vira um `customer`, e é o id dele que a cobrança
-- da fase 3 vai precisar.
--
-- Por que uma tabela, e não uma coluna em `tenants`/`administradoras`:
--   1. O vínculo tem estado próprio (quando sincronizou, o que foi mandado, o
--      que deu errado) — três colunas de diagnóstico em duas tabelas de
--      cadastro seria espalhar o assunto.
--   2. Cliente é XOR entre as duas tabelas, como já é em `assinatura_condicoes`
--      e `assinatura_faturas`. A mesma forma, o mesmo CHECK, a mesma leitura.

CREATE TABLE assinatura_clientes_gateway (
  id                 UUID          PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Vale para UM condomínio ou UMA administradora, nunca os dois.
  tenant_id          UUID          REFERENCES tenants(id)         ON DELETE CASCADE,
  administradora_id  UUID          REFERENCES administradoras(id) ON DELETE CASCADE,

  -- Id do `customer` na Payment API (lá é um Long). NULL = a sincronização foi
  -- tentada e não deu certo: a linha existe para guardar o motivo em
  -- `erro_ultima_sync`, que é o que alimenta a tela de Pendências. Sem isso, o
  -- erro só existiria no log, e ninguém investiga log de cliente que nunca
  -- apareceu numa tela.
  customer_id        BIGINT,
  -- Id no Asaas, para conferência com o painel deles no dia de um suporte.
  asaas_id           VARCHAR(60),

  -- O documento que foi ENVIADO. Não é redundante com `tenants.documento`:
  -- guardado aqui, ele denuncia a divergência depois que alguém corrigir o
  -- cadastro — e documento não é atualizável no gateway (`PUT /customers`
  -- ignora o campo), então essa divergência exige cliente novo lá.
  documento_enviado  VARCHAR(14),

  sincronizado_em    TIMESTAMPTZ,
  erro_ultima_sync   TEXT,

  created_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_assinatura_clientes_gateway_dono CHECK (
    (tenant_id IS NOT NULL AND administradora_id IS NULL) OR
    (tenant_id IS NULL AND administradora_id IS NOT NULL)
  )
);

-- Um vínculo por cliente. Dois seriam duas cobranças pelo mesmo condomínio.
CREATE UNIQUE INDEX uq_assinatura_clientes_gateway_tenant
  ON assinatura_clientes_gateway(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE UNIQUE INDEX uq_assinatura_clientes_gateway_administradora
  ON assinatura_clientes_gateway(administradora_id) WHERE administradora_id IS NOT NULL;

-- E um cliente do gateway pertence a um cliente nosso só. Sem isto, dois
-- condomínios apontando para o mesmo `customer` fariam a inadimplência de um
-- bloquear o outro na fase 5 — e a conta de um aparecer no extrato do outro.
CREATE UNIQUE INDEX uq_assinatura_clientes_gateway_customer
  ON assinatura_clientes_gateway(customer_id) WHERE customer_id IS NOT NULL;

CREATE TRIGGER trg_assinatura_clientes_gateway_updated_at
BEFORE UPDATE ON assinatura_clientes_gateway FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE assinatura_clientes_gateway IS
  'Vínculo entre o cliente que paga o Chegou (condomínio direto XOR administradora) e o customer no gateway de pagamento.';
COMMENT ON COLUMN assinatura_clientes_gateway.customer_id IS
  'Id do customer na Payment API. NULL = tentativa registrada que falhou; o motivo está em erro_ultima_sync.';
COMMENT ON COLUMN assinatura_clientes_gateway.documento_enviado IS
  'Documento efetivamente enviado ao gateway. Diverge de tenants.documento quando o cadastro mudou depois — e documento não se altera no gateway.';
