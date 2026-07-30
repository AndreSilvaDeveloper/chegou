-- Dia de vencimento da assinatura, por condomínio.
--
-- Até aqui o vencimento era decidido **na hora de gerar o lote**: um único dia
-- para todas as faturas da competência. Isso não sobrevive ao primeiro cliente
-- que negocia "eu pago dia 5" — a alternativa seria gerar o lote duas vezes,
-- com dias diferentes, o que quebra a idempotência da geração.
--
-- Coluna dedicada (e não dentro do `config_json`) por dois motivos:
--   1. `config_json` é o operacional do condomínio, editável pelo síndico e pela
--      administradora. Vencimento é **contrato**, e contrato é do superadmin.
--   2. A geração lê o dia de todos os condomínios de uma vez; num JSONB isso
--      seria um filtro por chave em vez de uma coluna simples.
--
-- NULL = usa o dia informado na geração (ou o padrão da plataforma, dia 10). É
-- o valor da esmagadora maioria: só quem negociou algo diferente preenche.
--
-- Não toca fatura já emitida: o vencimento dela é fotografia, gravada na
-- própria fatura. Mudar aqui vale a partir da próxima geração.
ALTER TABLE tenants
  ADD COLUMN assinatura_dia_vencimento SMALLINT,
  ADD CONSTRAINT chk_tenants_assinatura_dia_vencimento
    CHECK (assinatura_dia_vencimento IS NULL OR assinatura_dia_vencimento BETWEEN 1 AND 31);

COMMENT ON COLUMN tenants.assinatura_dia_vencimento IS 'Dia do vencimento da fatura da assinatura deste condomínio (1-31). NULL = usa o padrão da plataforma. Dia maior que o mês é encaixado no último dia.';
