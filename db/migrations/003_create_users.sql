-- Usuários do painel: superadmin do SaaS, síndico, admin do condomínio, porteiros
-- tenant_id NULL = superadmin global da plataforma
CREATE TABLE users (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID         REFERENCES tenants(id) ON DELETE CASCADE,
  nome          VARCHAR(200) NOT NULL,
  email         CITEXT       NOT NULL,
  senha_hash    VARCHAR(255) NOT NULL,
  role          VARCHAR(20)  NOT NULL
                CHECK (role IN ('superadmin', 'sindico', 'admin', 'porteiro')),
  telefone      VARCHAR(20),
  ativo         BOOLEAN      NOT NULL DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  -- superadmin DEVE ter tenant_id NULL; demais roles DEVEM ter tenant_id
  CONSTRAINT chk_users_tenant_role CHECK (
    (role = 'superadmin' AND tenant_id IS NULL) OR
    (role <> 'superadmin' AND tenant_id IS NOT NULL)
  )
);

-- Email único por tenant
CREATE UNIQUE INDEX uq_users_email_tenant
  ON users(tenant_id, email)
  WHERE tenant_id IS NOT NULL;

-- Email único entre superadmins
CREATE UNIQUE INDEX uq_users_email_super
  ON users(email)
  WHERE tenant_id IS NULL;

CREATE INDEX idx_users_tenant_ativo ON users(tenant_id, ativo);

CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
