-- Coordenadas do condomínio, para o mapa da plataforma.
--
-- Duas colunas NUMERIC e não PostGIS: a única pergunta prevista é "onde
-- desenhar o alfinete", e para isso um par de números basta. PostGIS entraria
-- para responder "quais condomínios num raio de X km", que ninguém pediu — e
-- traria uma extensão no banco, um tipo novo no ORM e uma dependência a mais no
-- Docker de dev.
--
-- `NUMERIC(10,7)` guarda até ~1 cm de precisão (o sétimo decimal vale 1,1 cm no
-- equador), muito além do que geocodificação de endereço entrega. Float seria
-- menor e mais rápido, e erraria o último decimal na ida e volta — num dado que
-- existe para ser comparado com o que o provedor devolveu, isso confunde.
--
-- POR QUE `geo_precisao` EXISTE
--
-- A coordenada vem de três lugares com qualidades muito diferentes, e um mapa
-- que trate os três igual mente para quem olha:
--
--   endereco → geocodificação de rua + número (o alfinete está na porta)
--   cep      → coordenada do CEP (a rua certa, o número não)
--   cidade   → centro do município (CEP único de cidade pequena; o alfinete
--              está a quilômetros do condomínio)
--
-- Sem essa coluna, o alfinete de "centro de Juiz de Fora" pareceria tão exato
-- quanto o da portaria — e alguém tomaria decisão em cima disso.
--
-- Tudo nasce NULL: geocodificar depende de rede e acontece **depois** do
-- salvamento, numa fila. Condomínio sem coordenada é estado normal, não erro.
ALTER TABLE tenants
  ADD COLUMN latitude NUMERIC(10, 7),
  ADD COLUMN longitude NUMERIC(10, 7),
  ADD COLUMN geo_precisao VARCHAR(20),
  ADD COLUMN geo_atualizado_em TIMESTAMPTZ;

-- Faixa geográfica válida. Não é preciosismo: provedor que devolve string vazia
-- ou troca latitude com longitude produz um par que "existe" e cai no meio do
-- oceano — e no mapa isso aparece como um condomínio na costa da África.
ALTER TABLE tenants
  ADD CONSTRAINT chk_tenants_latitude
    CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  ADD CONSTRAINT chk_tenants_longitude
    CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  ADD CONSTRAINT chk_tenants_geo_precisao
    CHECK (geo_precisao IS NULL OR geo_precisao IN ('endereco', 'cep', 'cidade')),
  -- Latitude sem longitude não desenha nada. Ou vêm as duas, ou nenhuma.
  ADD CONSTRAINT chk_tenants_geo_par
    CHECK ((latitude IS NULL) = (longitude IS NULL));

COMMENT ON COLUMN tenants.latitude IS 'Latitude do condomínio (WGS84). NULL = ainda não resolvida ou não encontrada.';
COMMENT ON COLUMN tenants.longitude IS 'Longitude do condomínio (WGS84).';
COMMENT ON COLUMN tenants.geo_precisao IS 'De onde veio a coordenada: endereco (rua+número), cep (a rua) ou cidade (o centro do município, aproximado).';
COMMENT ON COLUMN tenants.geo_atualizado_em IS 'Quando a geocodificação rodou pela última vez — inclusive quando não achou nada.';
