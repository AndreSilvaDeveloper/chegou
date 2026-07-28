-- Autocadastro de morador via QR Code.
--
-- O síndico (ou a administradora) gera um link público com este token; o morador
-- lê o QR, abre a página sem login e se cadastra sozinho. O token é o que amarra
-- o cadastro ao condomínio certo: o `tenant_id` NUNCA vem do cliente, é resolvido
-- a partir daqui no servidor.
--
-- Coluna dedicada (em vez de dentro do config_json) porque a rota pública faz
-- lookup POR VALOR do token a cada acesso: o UNIQUE dá o índice e garante que dois
-- condomínios não colidam. "Gerar novo link" é um UPDATE deste campo, que invalida
-- o anterior de imediato.
ALTER TABLE tenants
  ADD COLUMN autocadastro_token VARCHAR(32);

CREATE UNIQUE INDEX idx_tenants_autocadastro_token
  ON tenants(autocadastro_token)
  WHERE autocadastro_token IS NOT NULL;

COMMENT ON COLUMN tenants.autocadastro_token IS 'Token do link público de autocadastro de morador (QR). NULL = link ainda não gerado. Rotacionar invalida o anterior.';
