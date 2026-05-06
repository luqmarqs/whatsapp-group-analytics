#!/usr/bin/env bash
# Usage: ./scripts/restore-postgres.sh <backup-file.sql.gz>

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

if [ -f "$PROJECT_DIR/.env" ]; then
  set -a; source "$PROJECT_DIR/.env"; set +a
fi

POSTGRES_DB="${POSTGRES_DB:?Missing POSTGRES_DB}"
POSTGRES_USER="${POSTGRES_USER:?Missing POSTGRES_USER}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:?Missing POSTGRES_PASSWORD}"

BACKUP_FILE="${1:?Usage: $0 <backup-file.sql.gz>}"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "[restore] ERROR: file not found: $BACKUP_FILE"
  exit 1
fi

echo "[restore] WARNING: this will OVERWRITE the current database ($POSTGRES_DB)."
read -rp "         Type 'yes' to continue: " confirm
if [ "$confirm" != "yes" ]; then
  echo "[restore] aborted"
  exit 0
fi

echo "[restore] restoring from $BACKUP_FILE …"

gunzip -c "$BACKUP_FILE" | docker compose -f "$PROJECT_DIR/docker-compose.yml" exec -T postgres \
  bash -c "PGPASSWORD='$POSTGRES_PASSWORD' psql -U '$POSTGRES_USER' '$POSTGRES_DB'"

echo "[restore] done"
