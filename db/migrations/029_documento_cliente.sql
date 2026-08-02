-- `cnpj` vira `documento`: aceita CPF **ou** CNPJ.
--
-- Motivo: para cobrar de verdade o cliente precisa existir no gateway de
-- pagamento, e lá o documento é obrigatório. Nem todo condomínio tem CNPJ —
-- muitos são administrados pelo síndico em nome próprio. Exigir CNPJ deixaria
-- esses clientes sem cobrança possível; aceitar os dois resolve sem exceção no
-- código.
--
-- A coluna já era VARCHAR(14), que comporta os dois (CPF tem 11, CNPJ tem 14) —
-- então é só renomear. Guardamos **sem formatação**, como já era.
--
-- O CHECK entra como NOT VALID de propósito: ele passa a valer para toda linha
-- nova ou alterada, mas não recusa o que já está no banco. Dado legado com
-- máscara ou documento pela metade é problema de cadastro, e derrubar a
-- migration por causa dele deixaria o sistema inteiro sem subir. A validação de
-- verdade (dígito verificador) mora no DTO, onde dá para explicar o erro.

ALTER TABLE tenants RENAME COLUMN cnpj TO documento;
ALTER TABLE administradoras RENAME COLUMN cnpj TO documento;

-- O CHECK antigo do condomínio exigia EXATAMENTE 14 dígitos. Renomear a coluna
-- não o desfaz — ele continuaria recusando todo CPF, que é justamente o caso
-- que esta migration existe para permitir. Some daqui; quem valida agora é o
-- CHECK novo abaixo.
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS chk_tenants_cnpj;

-- Índices únicos com nome antigo: o dado é o mesmo, só o nome mentia.
ALTER INDEX IF EXISTS tenants_cnpj_key RENAME TO uq_tenants_documento;
ALTER INDEX IF EXISTS uq_administradoras_cnpj RENAME TO uq_administradoras_documento;

ALTER TABLE tenants
  ADD CONSTRAINT chk_tenants_documento
    CHECK (documento IS NULL OR documento ~ '^[0-9]{11}$' OR documento ~ '^[0-9]{14}$')
    NOT VALID;

ALTER TABLE administradoras
  ADD CONSTRAINT chk_administradoras_documento
    CHECK (documento IS NULL OR documento ~ '^[0-9]{11}$' OR documento ~ '^[0-9]{14}$')
    NOT VALID;

COMMENT ON COLUMN tenants.documento IS
  'CPF (11) ou CNPJ (14) do condomínio, só dígitos. É o documento do sacado no gateway de pagamento.';
COMMENT ON COLUMN administradoras.documento IS
  'CPF (11) ou CNPJ (14) da administradora, só dígitos. É o documento do sacado no gateway de pagamento.';
