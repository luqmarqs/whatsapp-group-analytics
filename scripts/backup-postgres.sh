#!/usr/bin/env bash
# Usage: ./scripts/backup-postgres.sh
# Reads variables from .env in the project root.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

if [ -f "$PROJECT_DIR/.env" ]; then
  # shellcheck disable=SC1091
  set -a; source "$PROJECT_DIR/.env"; set +a
fi

POSTGRES_DB="${POSTGRES_DB:?Missing POSTGRES_DB}"
POSTGRES_USER="${POSTGRES_USER:?Missing POSTGRES_USER}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:?Missing POSTGRES_PASSWORD}"

BACKUP_DIR="${BACKUP_DIR:-$PROJECT_DIR/backups}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/wga_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "[backup] dumping database to $BACKUP_FILE …"

docker compose -f "$PROJECT_DIR/docker-compose.yml" exec -T postgres \
  bash -c "PGPASSWORD='$POSTGRES_PASSWORD' pg_dump -U '$POSTGRES_USER' '$POSTGRES_DB'" \
  | gzip > "$BACKUP_FILE"

echo "[backup] done — $(du -sh "$BACKUP_FILE" | cut -f1)"

# Keep only last 14 backups
find "$BACKUP_DIR" -name "wga_*.sql.gz" | sort | head -n -14 | xargs -r rm --

echo "[backup] old backups pruned (keeping last 14)"
