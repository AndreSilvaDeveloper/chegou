-- A fatura vira cobrança de verdade.
--
-- Até aqui `assinatura_faturas` era um registro contábil nosso: quanto o
-- cliente deve neste mês. Agora ela também aponta para a cobrança no gateway —
-- o link que o cliente abre para pagar.
--
-- **A fatura continua sendo nossa.** O gateway só cobra. Por isso nada aqui
-- substitui o valor: `valor` continua sendo o que nós calculamos, e as colunas
-- novas são o rastro da emissão.
--
-- As duas partes (colunas de cobrança e status novos de fatura) entram na MESMA
-- migration de propósito. Separadas, existiria um intervalo em que o código já
-- sabe gravar `estornada` e o CHECK ainda recusa — e uma cobrança estornada
-- chegando nesse intervalo derrubaria o processamento do webhook.

-- ---------------------------------------------------------------------------
-- 1. O rastro da cobrança
-- ---------------------------------------------------------------------------
ALTER TABLE assinatura_faturas
  -- Id da cobrança na Payment API (lá é um Long).
  ADD COLUMN cobranca_id              BIGINT,
  -- Id no Asaas, para conferência com o painel deles num suporte.
  ADD COLUMN cobranca_asaas_id        VARCHAR(60),

  -- O estado da EMISSÃO (nosso processo), que não se confunde com o `status`
  -- da fatura (se o cliente deve ou pagou):
  --   pendente  → ainda não foi emitida
  --   emitida   → existe cobrança no gateway, com link
  --   erro      → tentamos e falhou; o motivo está em cobranca_erro
  --   desligada → não havia gateway configurado (dev, ou antes de ligar)
  --   cancelada → a cobrança foi cancelada no gateway
  ADD COLUMN cobranca_status          VARCHAR(20) NOT NULL DEFAULT 'pendente',

  -- O status BRUTO do gateway (PENDING, CONFIRMED, RECEIVED, OVERDUE...).
  -- O nosso `status` é um resumo, e resumo não serve para investigar
  -- divergência: quando a conciliação acusar diferença, é este campo que diz o
  -- que o outro lado realmente pensa.
  ADD COLUMN cobranca_status_gateway  VARCHAR(40),

  -- A chave de idempotência, gerada UMA vez e gravada ANTES do POST.
  -- É o que impede cobrar o cliente duas vezes: no retry depois de um timeout,
  -- a mesma chave faz a API devolver a mesma cobrança em vez de criar outra.
  -- Gerar chave nova no retry é exatamente como se cobra em duplicidade.
  ADD COLUMN cobranca_idempotency_key UUID,

  ADD COLUMN cobranca_erro            TEXT,

  -- O link de pagamento. O cliente escolhe PIX, boleto ou cartão na tela do
  -- gateway — por isso um link só, e não três campos de método.
  ADD COLUMN invoice_url              TEXT,

  -- Quando o estado da cobrança foi confirmado com o gateway pela última vez
  -- (emissão ou conciliação).
  ADD COLUMN sincronizado_em          TIMESTAMPTZ,

  -- Dinheiro que entrou por fora e o gateway ainda não sabe: a baixa manual
  -- acontece SEMPRE do nosso lado, mesmo com a API fora do ar — dinheiro que
  -- entrou não pode ficar refém de integração. Esta marca é o que a
  -- conciliação procura depois.
  ADD COLUMN cobranca_dessincronizada BOOLEAN NOT NULL DEFAULT false,

  ADD CONSTRAINT chk_assinatura_faturas_cobranca_status
    CHECK (cobranca_status IN ('pendente','emitida','erro','desligada','cancelada'));

-- Uma cobrança do gateway pertence a UMA fatura. Sem isto, um retry que
-- gravasse errado poderia apontar duas faturas para a mesma cobrança, e a baixa
-- de uma marcaria a outra como paga.
CREATE UNIQUE INDEX uq_assinatura_faturas_cobranca
  ON assinatura_faturas(cobranca_id) WHERE cobranca_id IS NOT NULL;

-- A fila de emissão procura por isto; o índice parcial é pequeno porque a
-- maioria das faturas já está emitida.
CREATE INDEX idx_assinatura_faturas_cobranca_pendente
  ON assinatura_faturas(cobranca_status)
  WHERE cobranca_status IN ('pendente','erro');

COMMENT ON COLUMN assinatura_faturas.cobranca_idempotency_key IS
  'Chave de idempotência da emissão. Gerada uma vez e persistida ANTES do POST — no retry, a MESMA chave devolve a mesma cobrança em vez de criar outra.';
COMMENT ON COLUMN assinatura_faturas.cobranca_status_gateway IS
  'Status bruto do gateway (PENDING/CONFIRMED/RECEIVED/...). O nosso status é um resumo; este é o que serve para investigar divergência.';
COMMENT ON COLUMN assinatura_faturas.cobranca_dessincronizada IS
  'Baixa ou cancelamento aplicado localmente que o gateway ainda não confirmou. A conciliação resolve depois.';

-- ---------------------------------------------------------------------------
-- 2. Dois status novos de fatura
-- ---------------------------------------------------------------------------
-- `estornada` e `em_disputa` existem porque o gateway conhece desfechos que a
-- nossa régua de "aberta/paga/vencida/cancelada" não cobria:
--
--   estornada   → REFUNDED / REFUND_IN_PROGRESS. Não é dívida ativa (o cliente
--                 não deve) nem receita (o dinheiro voltou).
--   em_disputa  → CHARGEBACK_* / DUNNING_*. Fica fora de todos os totais e
--                 aparece para o superadmin: é caso que precisa de gente.
--
-- Nenhum dos dois é alcançável por ação nossa — os dois chegam pelo webhook da
-- fase 4. Entram agora porque o CHECK precisa aceitá-los antes de o primeiro
-- evento chegar.
-- O CHECK original foi escrito inline na criação da tabela (024), então o
-- Postgres deu a ele o nome automático `assinatura_faturas_status_check` — não
-- o `chk_...` do resto do arquivo. Os dois nomes são derrubados porque só um
-- existe, e qual deles depende de quando o banco foi criado.
ALTER TABLE assinatura_faturas
  DROP CONSTRAINT IF EXISTS assinatura_faturas_status_check,
  DROP CONSTRAINT IF EXISTS chk_assinatura_faturas_status;

ALTER TABLE assinatura_faturas
  ADD CONSTRAINT chk_assinatura_faturas_status
    CHECK (status IN ('aberta','paga','vencida','cancelada','estornada','em_disputa'));
