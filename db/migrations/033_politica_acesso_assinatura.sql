-- A política de bloqueio por inadimplência.
--
-- Quem decide se um cliente está bloqueado é o **gateway** (ele conhece as
-- cobranças vencidas). O que esta tabela guarda é a **configuração** dessa
-- decisão: quantas faturas vencidas, quantos dias de tolerância, e a mensagem
-- que o cliente lê.
--
-- Por que um espelho local, se a política vive lá:
--   1. A tela do superadmin abre sem round-trip — e continua abrindo com o
--      gateway fora do ar, que é quando alguém vai querer conferir o que está
--      configurado.
--   2. Guarda o que **nós** mandamos. Se a política de lá divergir do que a tela
--      mostra, a divergência fica visível em vez de silenciosa.
--
-- Linha única: somos uma company só no gateway. O CHECK garante isso — sem ele,
-- uma segunda linha faria a tela mostrar uma política e a API usar outra.

CREATE TABLE assinatura_politica_acesso (
  -- Sempre 1. É o que torna a tabela de linha única sem depender de disciplina.
  id                     INTEGER       PRIMARY KEY DEFAULT 1 CHECK (id = 1),

  -- Quantas faturas vencidas até bloquear. Mínimo 1 do lado deles.
  max_faturas_vencidas   INTEGER       NOT NULL DEFAULT 1 CHECK (max_faturas_vencidas >= 1),
  -- Dias de tolerância depois do vencimento. O amortecedor que impede o cliente
  -- que esqueceu o boleto de ficar sem portaria na segunda-feira de manhã.
  dias_tolerancia        INTEGER       NOT NULL DEFAULT 5 CHECK (dias_tolerancia >= 0),

  -- **Sem isto, NADA bloqueia.** A política nasce com `blockOnStandaloneCharges`
  -- falso do lado deles, e nós usamos cobrança avulsa — então o access-status
  -- responderia "liberado" para todo mundo, sempre. Configurar isto é parte da
  -- instalação, não um detalhe de tela.
  bloquear_avulsas       BOOLEAN       NOT NULL DEFAULT true,

  mensagem_bloqueio      TEXT,
  cache_ttl_minutos      INTEGER       NOT NULL DEFAULT 5 CHECK (cache_ttl_minutos >= 1),

  -- Quando esta configuração foi enviada ao gateway, e o que deu errado.
  sincronizado_em        TIMESTAMPTZ,
  erro_ultima_sync       TEXT,

  created_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_assinatura_politica_acesso_updated_at
BEFORE UPDATE ON assinatura_politica_acesso FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- A linha nasce com os valores recomendados: 5 dias de tolerância e 1 fatura.
-- O cliente que esquece o boleto não fica sem portaria por causa disso, e quem
-- realmente parou de pagar é alcançado na semana seguinte.
INSERT INTO assinatura_politica_acesso (id, mensagem_bloqueio)
VALUES (1, 'Assinatura do Chegou em atraso. Regularize para voltar a registrar encomendas.');

COMMENT ON TABLE assinatura_politica_acesso IS
  'Espelho local da política de bloqueio enviada ao gateway. Linha única (id = 1): somos uma company só.';
COMMENT ON COLUMN assinatura_politica_acesso.bloquear_avulsas IS
  'blockOnStandaloneCharges. Sem isto nada bloqueia: usamos cobrança avulsa, e o padrão do gateway é false.';
COMMENT ON COLUMN assinatura_politica_acesso.dias_tolerancia IS
  'Amortecedor: dias depois do vencimento antes de travar. Existe para o esquecimento não virar portaria parada.';
