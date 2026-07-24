-- Sessão OpenWA (gateway WhatsApp não-oficial) vinculada ao condomínio.
-- Cada tenant tem a sua própria instância/sessão para conexão via QR e disparo de mensagens.
ALTER TABLE tenants
  ADD COLUMN whatsapp_session_id   UUID,
  ADD COLUMN whatsapp_session_name VARCHAR(60),
  ADD COLUMN whatsapp_status       VARCHAR(30);

COMMENT ON COLUMN tenants.whatsapp_session_id   IS 'UUID da sessão no gateway OpenWA (instância do condomínio)';
COMMENT ON COLUMN tenants.whatsapp_session_name IS 'Nome da sessão no gateway OpenWA';
COMMENT ON COLUMN tenants.whatsapp_status       IS 'Último status conhecido da sessão OpenWA (ready, qr_ready, disconnected, ...)';
