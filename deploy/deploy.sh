#!/usr/bin/env bash
# =============================================================================
# Deploy da Chegou — rode ISTO no servidor sempre que quiser publicar o que
# você commitou no GitHub:
#
#     cd ~/chegou/deploy && ./deploy.sh
#
# O que ele faz:
#   1. git pull        → traz o código novo (front, back, migrations, compose)
#   2. build + up -d   → rebuilda as imagens e recria os containers
#   3. migrations      → rodam sozinhas no start do container `api` (idempotente)
#   4. prune           → limpa imagens antigas
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "ERRO: deploy/.env não encontrado. Copie de .env.example e preencha." >&2
  exit 1
fi

echo ">> 1/3 git pull..."
git pull --ff-only

echo ">> 2/3 build + up (isso pode demorar no 1º deploy)..."
docker compose up -d --build

echo ">> 3/3 limpando imagens antigas..."
docker image prune -f

echo ""
echo "Deploy concluído. Status:"
docker compose ps
