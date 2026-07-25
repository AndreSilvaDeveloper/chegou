-- Administradoras: empresas que administram uma carteira de condomínios.
--
-- Hierarquia de acesso depois desta migration:
--   superadmin → dono da plataforma, enxerga todas as administradoras e condomínios
--   admin      → administradora; enxerga SÓ os condomínios da carteira dela
--   sindico    → gestão de um condomínio
--   porteiro   → operação de um condomínio
--
-- O `admin` não pertence a um condomínio (tenant_id NULL) e sim a uma
-- administradora. O condomínio em que ele opera é escolhido a cada request
-- (header X-Tenant-Id) e validado contra a carteira — ver TenantScopeGuard.

CREATE TABLE administradoras (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  nome              VARCHAR(200) NOT NULL,
  cnpj              VARCHAR(14),
  email_contato     CITEXT,
  telefone_contato  VARCHAR(20),
  ativo             BOOLEAN      NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_administradoras_cnpj ON administradoras(cnpj) WHERE cnpj IS NOT NULL;

CREATE TRIGGER trg_administradoras_updated_at
BEFORE UPDATE ON administradoras
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------ carteira
-- NULL = condomínio sem administradora, gerido direto pelo superadmin.
-- RESTRICT: apagar administradora com carteira é erro; o caminho é desativar
-- (ativo = false), como no resto do sistema.
ALTER TABLE tenants
  ADD COLUMN administradora_id UUID REFERENCES administradoras(id) ON DELETE RESTRICT;

CREATE INDEX idx_tenants_administradora ON tenants(administradora_id);

-- ------------------------------------------------------- vínculo do usuário
ALTER TABLE users
  ADD COLUMN administradora_id UUID REFERENCES administradoras(id) ON DELETE RESTRICT;

CREATE INDEX idx_users_administradora ON users(administradora_id);

-- Cada papel tem exatamente um escopo — é isso que impede um usuário de
-- condomínio ganhar carteira, ou uma administradora ficar presa a um condomínio.
ALTER TABLE users DROP CONSTRAINT chk_users_tenant_role;

ALTER TABLE users ADD CONSTRAINT chk_users_escopo CHECK (
  (role = 'superadmin' AND tenant_id IS NULL     AND administradora_id IS NULL) OR
  (role = 'admin'      AND tenant_id IS NULL     AND administradora_id IS NOT NULL) OR
  (role IN ('sindico', 'porteiro')
                       AND tenant_id IS NOT NULL AND administradora_id IS NULL)
);
