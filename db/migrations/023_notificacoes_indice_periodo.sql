-- Consultas por condomínio + período: a listagem de "Filas" (ordenada por data),
-- os relatórios e qualquer contagem por dia. O índice que existia é
-- (tenant_id, status), que obriga a varrer todas as linhas do condomínio quando
-- o filtro é temporal — e essa tabela só cresce.
CREATE INDEX IF NOT EXISTS idx_notif_tenant_created
  ON notificacoes(tenant_id, created_at DESC);

-- Para "o que saiu neste dia", usado na conferência do limite diário e no
-- relatório de entrega. Parcial: só interessa o que foi de fato enviado.
CREATE INDEX IF NOT EXISTS idx_notif_tenant_enviada
  ON notificacoes(tenant_id, enviada_at DESC)
  WHERE enviada_at IS NOT NULL;
