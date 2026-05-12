-- Log de auditoria genérico (quem, o quê, quando)
CREATE TABLE audit_log (
  id          BIGSERIAL    PRIMARY KEY,
  tenant_id   UUID         REFERENCES tenants(id) ON DELETE SET NULL,
  user_id     UUID         REFERENCES users(id)   ON DELETE SET NULL,
  entity      VARCHAR(40)  NOT NULL,                  -- 'encomenda', 'morador', ...
  entity_id   UUID,
  action      VARCHAR(40)  NOT NULL,                  -- 'create','update','delete','notify','pickup','cancel'
  diff_json   JSONB        NOT NULL DEFAULT '{}'::jsonb,
  ip_address  INET,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_tenant_created ON audit_log(tenant_id, created_at DESC);
CREATE INDEX idx_audit_entity         ON audit_log(entity, entity_id);
CREATE INDEX idx_audit_user           ON audit_log(user_id, created_at DESC);
