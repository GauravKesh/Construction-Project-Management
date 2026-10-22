#!/usr/bin/env bash
set -euo pipefail

# Load environment variables if .env exists
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

BACKUP_DIR="${1:-./data/backups/$(date +%Y%m%d_%H%M%S)}"
mkdir -p "$BACKUP_DIR"

echo "=== Starting Backup to $BACKUP_DIR ==="

# 1. PostgreSQL backup
echo "Dumping PostgreSQL database: ${POSTGRES_DB:-construction_db}..."
PGPASSWORD="${POSTGRES_PASSWORD:-}" pg_dump -h "${POSTGRES_HOST:-localhost}" \
  -p "${POSTGRES_PORT:-5432}" \
  -U "${POSTGRES_USER:-gaurav}" \
  -F c -b -v -f "$BACKUP_DIR/postgres.dump" "${POSTGRES_DB:-construction_db}" || echo "Warning: pg_dump had non-zero exit or tool missing"

# 2. MongoDB backup
echo "Dumping MongoDB database: ${MONGO_DB:-construction_mongo}..."
if command -v mongodump &> /dev/null; then
  mongodump --uri="${MONGO_URI:-mongodb://localhost:27017}" \
    --db="${MONGO_DB:-construction_mongo}" \
    --out="$BACKUP_DIR/mongo" || echo "Warning: mongodump failed"
else
  echo "mongodump not installed, skipping mongo raw dump"
fi

# 3. Storage files backup
STORAGE_PATH="${STORAGE_LOCAL_PATH:-./data/storage}"
if [ -d "$STORAGE_PATH" ]; then
  echo "Copying local storage files from $STORAGE_PATH..."
  mkdir -p "$BACKUP_DIR/storage"
  cp -r "$STORAGE_PATH"/* "$BACKUP_DIR/storage/" || true
fi

echo "=== Backup completed successfully at $BACKUP_DIR ==="
