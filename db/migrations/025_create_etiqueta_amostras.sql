-- Banco de amostras de etiqueta de entrega.
--
-- Serve para afinar o parser (src/modules/etiquetas/parser): o superadmin sobe
-- fotos de etiquetas reais, marca o gabarito e roda o parser contra todas para
-- ver o placar de acerto. É o banco de regressão da leitura de etiqueta.
--
-- Tabela de PLATAFORMA, não de condomínio — por isso `tenant_id` é nulável, ao
-- contrário da regra geral do projeto. Uma etiqueta da Shopee é igual em todo
-- condomínio; o que se aprende com ela vale para todos. O `tenant_id` guarda
-- só a ORIGEM, quando a amostra nasceu de uma leitura real.
CREATE TABLE etiqueta_amostras (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ON DELETE SET NULL, e não CASCADE: apagar um condomínio não pode apagar
  -- amostras do banco de regressão — o parser regrediria sem ninguém notar.
  tenant_id       UUID REFERENCES tenants(id) ON DELETE SET NULL,

  foto_url        TEXT NOT NULL,
  -- Guardado para conseguir remover do bucket junto com a amostra.
  foto_key        TEXT NOT NULL,

  -- Rótulo do superadmin (Correios, Shopee, ...). Só para agrupar o placar e
  -- responder "onde a gente erra mais". Não é o que o parser extraiu.
  transportadora  VARCHAR(60),

  -- Saída crua do serviço de OCR: [{texto, confianca, box}]. É o insumo do
  -- reprocessamento — permite rodar um parser novo SEM reenviar a foto ao OCR
  -- (que custa segundos de CPU por imagem).
  ocr_linhas      JSONB NOT NULL DEFAULT '[]'::jsonb,
  ocr_ms          INTEGER,

  -- O que o parser extraiu na última rodada, e com qual versão dele.
  extraido        JSONB,
  parser_versao   VARCHAR(20),

  -- O que DEVERIA ter sido extraído, preenchido à mão pelo superadmin.
  -- NULL = amostra ainda não conferida, não entra no placar.
  gabarito        JSONB,

  observacao      TEXT,

  ativo           BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_etiqueta_amostras_listagem ON etiqueta_amostras(ativo, created_at DESC);

-- A tela filtra por transportadora para responder "quanto a gente acerta na
-- Shopee?"; o índice parcial cobre isso sem carregar as inativas.
CREATE INDEX idx_etiqueta_amostras_transportadora
  ON etiqueta_amostras(transportadora)
  WHERE ativo;

-- Só as conferidas entram no placar, e são a minoria — vale o índice parcial.
CREATE INDEX idx_etiqueta_amostras_conferidas
  ON etiqueta_amostras(created_at DESC)
  WHERE ativo AND gabarito IS NOT NULL;

CREATE TRIGGER trg_etiqueta_amostras_updated_at
BEFORE UPDATE ON etiqueta_amostras FOR EACH ROW EXECUTE FUNCTION set_updated_at();
