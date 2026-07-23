#!/usr/bin/env bash
# =============================================================================
# Emite o certificado TLS do Let's Encrypt na PRIMEIRA vez.
# Rode UMA vez, no servidor, dentro de deploy/ e com o DNS do subdomínio já
# apontando pro IP do servidor:
#
#     cd deploy && ./init-letsencrypt.sh
#
# Depois disso, o container `certbot` renova sozinho e o `proxy` recarrega.
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "ERRO: deploy/.env não encontrado. Copie de .env.example e preencha." >&2
  exit 1
fi

# carrega variáveis do .env
set -a; . ./.env; set +a

: "${DOMAIN:?Defina DOMAIN no .env}"
: "${LETSENCRYPT_EMAIL:?Defina LETSENCRYPT_EMAIL no .env}"

STAGING_ARG=""
if [ "${CERTBOT_STAGING:-0}" = "1" ]; then
  STAGING_ARG="--staging"
  echo ">> Modo STAGING (certificado de teste, não confiável no navegador)."
fi

COMPOSE="docker compose"
LIVE="/etc/letsencrypt/live/${DOMAIN}"

echo ">> 1/6 Buildando as imagens da aplicação (pode demorar no 1º build)..."
$COMPOSE build

echo ">> 2/6 Criando certificado temporário (dummy) para o nginx conseguir subir..."
$COMPOSE run --rm --entrypoint sh certbot -c "\
  mkdir -p ${LIVE} && \
  openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
    -keyout ${LIVE}/privkey.pem -out ${LIVE}/fullchain.pem -subj '/CN=${DOMAIN}'"

echo ">> 3/6 Subindo a stack (proxy com o cert temporário)..."
$COMPOSE up -d

echo ">> 4/6 Removendo o cert temporário..."
$COMPOSE run --rm --entrypoint sh certbot -c "\
  rm -rf /etc/letsencrypt/live/${DOMAIN} \
         /etc/letsencrypt/archive/${DOMAIN} \
         /etc/letsencrypt/renewal/${DOMAIN}.conf"

echo ">> 5/6 Pedindo o certificado real ao Let's Encrypt..."
$COMPOSE run --rm --entrypoint certbot certbot certonly \
  --webroot -w /var/www/certbot \
  --email "${LETSENCRYPT_EMAIL}" \
  -d "${DOMAIN}" \
  --agree-tos --no-eff-email --non-interactive \
  --force-renewal ${STAGING_ARG}

echo ">> 6/6 Recarregando o nginx com o certificado válido..."
$COMPOSE exec proxy nginx -s reload

echo ""
echo "OK! https://${DOMAIN} deve estar no ar com HTTPS válido."
echo "Se ainda não criou o superadmin, rode:  docker compose exec api node scripts/seed-prod.js"
