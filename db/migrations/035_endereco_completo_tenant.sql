-- Endereço completo do condomínio.
--
-- Até aqui o endereço era **uma linha de texto livre** (`tenants.endereco`) e o
-- CEP existia na tabela desde a migration 001 sem nunca ter aparecido em tela
-- nenhuma. Na prática cada condomínio escreveu do jeito que quis — "Rua Halfeld
-- 1179", "Av. Rio Branco, 2000 - sala 4, Centro" — e o cadastro que o gateway de
-- cobrança recebe (`addressStreet`) saía com número e bairro grudados na rua.
--
-- POR QUE `endereco` NÃO VIRA `logradouro`
--
-- A coluna continua se chamando `endereco`, agora com o sentido de **logradouro**
-- (rua/avenida, sem número). Renomear seria mais bonito e custaria caro por
-- nada: o texto que já está lá é, na esmagadora maioria, exatamente um
-- logradouro com o número no fim; `clientes-gateway.service.ts` mapeia
-- `endereco` → `addressStreet`; e três DTOs, três telas e o seed apontam para
-- esse nome. Nenhum backfill: separar "1179" de "Rua Halfeld 1179" por regex
-- acerta o caso fácil e estraga o difícil em silêncio. O que já está gravado
-- segue valendo como está e se ajeita na próxima vez que alguém salvar a tela.
--
-- As três colunas nascem NULL porque endereço completo é preenchimento
-- incremental: nenhum condomínio existente tem número ou bairro para receber, e
-- exigir isso agora quebraria todo PATCH que não mandasse os campos novos.
ALTER TABLE tenants
  ADD COLUMN numero VARCHAR(20),
  ADD COLUMN complemento VARCHAR(120),
  ADD COLUMN bairro VARCHAR(120);

COMMENT ON COLUMN tenants.endereco IS 'Logradouro do condomínio (rua/avenida), sem número. Vai como addressStreet para o gateway de cobrança.';
COMMENT ON COLUMN tenants.numero IS 'Número do condomínio no logradouro. Texto, e não inteiro: "s/n", "1179-A" e "KM 12" são endereços válidos.';
COMMENT ON COLUMN tenants.complemento IS 'Complemento do endereço: bloco, torre, sala, referência de portaria.';
COMMENT ON COLUMN tenants.bairro IS 'Bairro do condomínio.';
COMMENT ON COLUMN tenants.cep IS 'CEP do condomínio, só dígitos (8). A tela mascara para 00000-000.';
