-- Um único formato de telefone no sistema: E.164 (+5532999999999).
--
-- Antes desta migration só `moradores` e `vagas_locacao` guardavam E.164 (com
-- CHECK); os demais campos eram texto livre, então o mesmo número podia estar
-- gravado de três jeitos. A digitação nas telas passou a ser "(32) 99999-9999",
-- com a conversão feita na borda da API — aqui o dado antigo acompanha.

-- Converte o que dá para interpretar como número brasileiro:
--   11 dígitos (celular com DDD) ou 10 (fixo com DDD) → +55 + dígitos
--   12/13 dígitos começando com 55                    → + dígitos
-- O que já está em E.164 (começa com '+') fica como está; o que não dá para
-- interpretar (ramal, texto solto) também fica, para não destruir informação.
CREATE OR REPLACE FUNCTION normaliza_telefone_e164(valor TEXT) RETURNS TEXT AS $$
DECLARE
  digitos TEXT;
BEGIN
  IF valor IS NULL OR btrim(valor) = '' THEN
    RETURN NULL;
  END IF;

  IF left(btrim(valor), 1) = '+' THEN
    RETURN '+' || regexp_replace(substr(btrim(valor), 2), '\D', '', 'g');
  END IF;

  digitos := regexp_replace(valor, '\D', '', 'g');

  IF length(digitos) IN (10, 11) THEN
    RETURN '+55' || digitos;
  END IF;

  IF length(digitos) IN (12, 13) AND left(digitos, 2) = '55' THEN
    RETURN '+' || digitos;
  END IF;

  RETURN valor;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

UPDATE users             SET telefone         = normaliza_telefone_e164(telefone)         WHERE telefone IS NOT NULL;
UPDATE funcionarios      SET telefone         = normaliza_telefone_e164(telefone)         WHERE telefone IS NOT NULL;
UPDATE tenants           SET telefone_contato = normaliza_telefone_e164(telefone_contato) WHERE telefone_contato IS NOT NULL;
UPDATE administradoras   SET telefone_contato = normaliza_telefone_e164(telefone_contato) WHERE telefone_contato IS NOT NULL;

-- NOT VALID: linha antiga que não deu para normalizar (ramal, "não tem") não
-- trava a migration, mas todo INSERT/UPDATE daqui em diante é verificado.
ALTER TABLE users
  ADD CONSTRAINT chk_users_telefone_e164
  CHECK (telefone IS NULL OR telefone ~ '^\+[1-9]\d{1,14}$') NOT VALID;

ALTER TABLE funcionarios
  ADD CONSTRAINT chk_funcionarios_telefone_e164
  CHECK (telefone IS NULL OR telefone ~ '^\+[1-9]\d{1,14}$') NOT VALID;

ALTER TABLE tenants
  ADD CONSTRAINT chk_tenants_telefone_e164
  CHECK (telefone_contato IS NULL OR telefone_contato ~ '^\+[1-9]\d{1,14}$') NOT VALID;

ALTER TABLE administradoras
  ADD CONSTRAINT chk_administradoras_telefone_e164
  CHECK (telefone_contato IS NULL OR telefone_contato ~ '^\+[1-9]\d{1,14}$') NOT VALID;

DROP FUNCTION normaliza_telefone_e164(TEXT);
