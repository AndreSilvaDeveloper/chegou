-- Webhooks de entrada podem chegar antes de sabermos o tenant (remetente desconhecido).
-- Permitir tenant_id NULL pra não perder esse log de auditoria.
ALTER TABLE whatsapp_messages ALTER COLUMN tenant_id DROP NOT NULL;
