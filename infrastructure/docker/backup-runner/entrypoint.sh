#!/usr/bin/env bash
set -euo pipefail

TIMESTAMP=$(date -u +"%Y%m%dT%H%M%SZ")

# Helper for logging
log() { echo "[backup-runner] $(date -u +"%Y-%m-%dT%H:%M:%SZ") - $*"; }

# Firestore export (to GCS)
if [ -n "${GCS_BUCKET:-}" ]; then
  log "Starting Firestore export to gs://$GCS_BUCKET/$FIRESTORE_EXPORT_PREFIX/$TIMESTAMP"
  if [ -n "${GOOGLE_APPLICATION_CREDENTIALS:-}" ]; then
    log "Activating GCP service account from GOOGLE_APPLICATION_CREDENTIALS"
    gcloud auth activate-service-account --key-file="$GOOGLE_APPLICATION_CREDENTIALS"
  fi
  if [ -n "${GCP_PROJECT:-}" ]; then
    gcloud config set project "$GCP_PROJECT"
  fi
  gcloud firestore export "gs://$GCS_BUCKET/$FIRESTORE_EXPORT_PREFIX/$TIMESTAMP"
  log "Firestore export finished"
fi

# Redis snapshot + upload to S3
if [ -n "${REDIS_HOST:-}" ] && [ -n "${S3_BUCKET:-}" ]; then
  log "Triggering Redis SAVE on $REDIS_HOST"
  if [ -n "${REDIS_PASSWORD:-}" ]; then
    redis-cli -h "$REDIS_HOST" -p "${REDIS_PORT:-6379}" -a "$REDIS_PASSWORD" SAVE || true
  else
    redis-cli -h "$REDIS_HOST" -p "${REDIS_PORT:-6379}" SAVE || true
  fi

  # Try common dump locations
  DUMP_LOCAL="/data/dump-${TIMESTAMP}.rdb"
  if [ -f "/data/dump.rdb" ]; then
    cp /data/dump.rdb "$DUMP_LOCAL"
  elif [ -f "/var/lib/redis/dump.rdb" ]; then
    cp /var/lib/redis/dump.rdb "$DUMP_LOCAL"
  else
    # Fallback to redis-cli --rdb (may require network access)
    log "No local dump found, attempting redis-cli --rdb to produce dump"
    redis-cli -h "$REDIS_HOST" --rdb "$DUMP_LOCAL"
  fi

  log "Uploading Redis dump to s3://$S3_BUCKET/redis-backups/$TIMESTAMP.rdb"
  aws s3 cp "$DUMP_LOCAL" "s3://$S3_BUCKET/redis-backups/$TIMESTAMP.rdb"
  log "Redis upload finished"
fi

log "Backup-runner finished"
