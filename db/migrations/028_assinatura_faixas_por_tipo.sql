-- Tabela de preços por TIPO DE CLIENTE.
--
-- Até aqui havia uma tabela de faixas só, usada tanto para o condomínio que
-- paga sozinho quanto para a administradora que paga pela carteira. Isso não
-- sobrevive ao modelo comercial: a administradora traz vários condomínios de
-- uma vez e paga um preço de atacado (R$ 1,99 por apartamento), enquanto o
-- condomínio direto anda pelas faixas de volume.
--
-- Uma coluna, e não uma tabela nova, porque o que muda entre os dois é só o
-- recorte: as faixas continuam sendo escolhidas pela quantidade, o preço da
-- faixa continua valendo para TODOS os apartamentos (não é escalonado por
-- trecho) e a última faixa continua sendo a aberta.
--
-- Não toca fatura já emitida: o preço cobrado é fotografia gravada na própria
-- fatura. Vale a partir da próxima geração.

ALTER TABLE assinatura_faixas
  ADD COLUMN tipo_cliente VARCHAR(20) NOT NULL DEFAULT 'condominio'
    CHECK (tipo_cliente IN ('condominio', 'administradora'));

-- O default existia só para preencher as linhas que já estavam lá.
ALTER TABLE assinatura_faixas ALTER COLUMN tipo_cliente DROP DEFAULT;

COMMENT ON COLUMN assinatura_faixas.tipo_cliente IS
  'Para quem esta faixa vale: condominio (paga sozinho) ou administradora (paga pela carteira).';

-- A ordem passa a ser única DENTRO do tipo: as duas tabelas têm a sua faixa 1.
DROP INDEX IF EXISTS uq_assinatura_faixas_ordem;
CREATE UNIQUE INDEX uq_assinatura_faixas_tipo_ordem
  ON assinatura_faixas(tipo_cliente, ordem);

-- ---------------------------------------------------------------------------
-- Corte novo da primeira faixa de condomínio: 50 → 100
-- ---------------------------------------------------------------------------
-- Guardado pelo valor antigo de propósito: se o superadmin já tiver mexido na
-- tabela, a negociação dele vale mais que o nosso padrão e nada é sobrescrito.
UPDATE assinatura_faixas
   SET ate_quantidade = 100
 WHERE tipo_cliente = 'condominio'
   AND ordem = 1
   AND ate_quantidade = 50
   AND preco_apartamento = 3.99;

-- ---------------------------------------------------------------------------
-- Tabela da administradora: preço único, sem teto
-- ---------------------------------------------------------------------------
-- Uma faixa aberta já resolve o preço de atacado combinado. O modelo aceita
-- mais faixas se um dia a administradora também escalonar por volume — por isso
-- é faixa, e não uma coluna de preço solta.
INSERT INTO assinatura_faixas (tipo_cliente, ate_quantidade, preco_apartamento, ordem)
SELECT 'administradora', NULL, 1.99, 1
 WHERE NOT EXISTS (
   SELECT 1 FROM assinatura_faixas WHERE tipo_cliente = 'administradora'
 );
