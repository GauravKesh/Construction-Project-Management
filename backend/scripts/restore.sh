#!/usr/bin/env bash
set -euo pipefail

if [ -z "${1:-}" ]; then
  echo "Usage: $0 <path_to_backup_dir>"
  exit 1
fi

BACKUP_DIR="$1"
if [ ! -d "$BACKUP_DIR" ]; then
  echo "Error: Directory $BACKUP_DIR does not exist."
  exit 1
fi

if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

echo "=== Starting Restore from $BACKUP_DIR ==="

# 1. PostgreSQL restore
if [ -f "$BACKUP_DIR/postgres.dump" ]; then
  echo "Restoring PostgreSQL database: ${POSTGRES_DB:-construction_db}..."
  PGPASSWORD="${POSTGRES_PASSWORD:-}" pg_restore -h "${POSTGRES_HOST:-localhost}" \
    -p "${POSTGRES_PORT:-5432}" \
    -U "${POSTGRES_USER:-gaurav}" \
    -d "${POSTGRES_DB:-construction_db}" \
    --clean --if-exists -v "$BACKUP_DIR/postgres.dump" || echo "Warning: pg_restore completed with warnings"
fi

# 2. MongoDB restore
if [ -d "$BACKUP_DIR/mongo/${MONGO_DB:-construction_mongo}" ]; then
  echo "Restoring MongoDB database: ${MONGO_DB:-construction_mongo}..."
  if command -v mongorestore &> /dev/null; then
    mongorestore --uri="${MONGO_URI:-mongodb://localhost:27017}" \
      --drop "$BACKUP_DIR/mongo" || echo "Warning: mongorestore failed"
  fi
fi

# 3. Storage restore
STORAGE_PATH="${STORAGE_LOCAL_PATH:-./data/storage}"
if [ -d "$BACKUP_DIR/storage" ]; then
  echo "Restoring storage files to $STORAGE_PATH..."
  mkdir -p "$STORAGE_PATH"
  cp -r "$BACKUP_DIR/storage"/* "$STORAGE_PATH/" || true
fi

echo "=== Restore completed ==="
