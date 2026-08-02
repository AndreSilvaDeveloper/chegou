-- O registro dos eventos de pagamento que chegam de fora.
--
-- O webhook é a via principal para saber que o cliente pagou. Duas coisas são
-- garantidas por esta tabela, e nenhuma delas é opcional numa integração de
-- dinheiro:
--
--   1. **Deduplicação.** Evento repetido é normal — o remetente reenvia quando
--      não recebe 200 a tempo, e um deploy no meio do caminho basta para isso
--      acontecer. Sem o índice único, o mesmo pagamento daria baixa duas vezes.
--
--   2. **Rastro do que chegou.** Guardamos o payload BRUTO. Quando um valor não
--      fechar daqui a três meses, a pergunta vai ser "o que exatamente eles nos
--      mandaram?", e nenhum resumo nosso responde isso.
--
-- Não tem `tenant_id`: o evento é da plataforma, não de um condomínio — mesma
-- razão de `assinatura_faturas` poder ter o sacado do lado da administradora.

CREATE TABLE assinatura_webhook_eventos (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),

  -- O id do evento no remetente. É a chave da deduplicação.
  evento_id       VARCHAR(120)  NOT NULL,
  -- `PAYMENT_RECEIVED`, `PAYMENT_REFUNDED`... Guardado como texto: um tipo novo
  -- do lado deles não pode derrubar a gravação aqui.
  tipo            VARCHAR(80),

  -- A fatura afetada, quando conseguimos correlacionar. NULL é normal e não é
  -- erro: pode ser cobrança de outro sistema na mesma company, ou um evento que
  -- chegou antes de a emissão terminar de gravar.
  fatura_id       UUID          REFERENCES assinatura_faturas(id) ON DELETE SET NULL,
  -- A referência que veio no evento, mesmo sem fatura encontrada — é por ela
  -- que se investiga um evento órfão.
  cobranca_id     BIGINT,

  status          VARCHAR(20)   NOT NULL DEFAULT 'pendente'
                  CHECK (status IN ('pendente','processado','ignorado','erro')),
  -- Por que foi ignorado, ou o que falhou.
  detalhe         TEXT,
  tentativas      INTEGER       NOT NULL DEFAULT 0,

  payload         JSONB         NOT NULL,

  recebido_em     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  processado_em   TIMESTAMPTZ,

  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- **A trava da deduplicação.** Evento repetido bate aqui e é descartado antes
-- de tocar em qualquer fatura.
CREATE UNIQUE INDEX uq_assinatura_webhook_eventos_evento
  ON assinatura_webhook_eventos(evento_id);

-- Investigar "o que aconteceu com esta fatura" é a consulta mais frequente.
CREATE INDEX idx_assinatura_webhook_eventos_fatura
  ON assinatura_webhook_eventos(fatura_id) WHERE fatura_id IS NOT NULL;

-- A tela de pendências procura o que não foi processado.
CREATE INDEX idx_assinatura_webhook_eventos_status
  ON assinatura_webhook_eventos(status, recebido_em DESC);

CREATE TRIGGER trg_assinatura_webhook_eventos_updated_at
BEFORE UPDATE ON assinatura_webhook_eventos FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE assinatura_webhook_eventos IS
  'Eventos de pagamento recebidos do gateway. O índice único em evento_id é o que impede dar baixa duas vezes no mesmo pagamento.';
COMMENT ON COLUMN assinatura_webhook_eventos.payload IS
  'Payload bruto, como chegou. Resumo nosso não responde "o que exatamente eles mandaram?" três meses depois.';
COMMENT ON COLUMN assinatura_webhook_eventos.fatura_id IS
  'NULL é normal: cobrança de outro sistema na mesma company, ou evento que chegou antes de a emissão gravar.';
