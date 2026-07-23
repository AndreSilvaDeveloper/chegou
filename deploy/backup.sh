#!/usr/bin/env bash
# Backup do Postgres para deploy/backups/. Agende no cron (ver README).
#   cd deploy && ./backup.sh
set -euo pipefail
cd "$(dirname "$0")"

mkdir -p backups
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="backups/chegou-${STAMP}.sql.gz"

docker compose exec -T postgres pg_dump -U portaria -d portaria | gzip > "$OUT"
echo "Backup salvo em deploy/${OUT}"

# Mantém só os 14 backups mais recentes
ls -1t backups/chegou-*.sql.gz | tail -n +15 | xargs -r rm -f
