-- Tipo do pacote: caixa ou envelope (opcional)
ALTER TABLE encomendas ADD COLUMN tipo VARCHAR(20)
  CHECK (tipo IN ('caixa', 'envelope'));
