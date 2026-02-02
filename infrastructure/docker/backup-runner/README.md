Backup Runner Docker image

This image provides a small runner to perform:
- Firestore export to a GCS bucket using `gcloud firestore export`
- Redis snapshot and upload to S3 using `redis-cli` + `aws s3 cp`

Environment variables (examples):
- `GCS_BUCKET` — GCS bucket name for Firestore export (optional)
- `GCP_PROJECT` — GCP project id (optional)
- `GOOGLE_APPLICATION_CREDENTIALS` — path to mounted service account JSON inside container (optional)
- `REDIS_HOST` — host for Redis (optional)
- `REDIS_PORT` — Redis port (default 6379)
- `REDIS_PASSWORD` — Redis password if any (optional)
- `S3_BUCKET` — S3 bucket name for Redis dump (required if `REDIS_HOST` is set)
- `FIRESTORE_EXPORT_PREFIX` — prefix path inside GCS bucket (default `firestore-backups`)

Usage (local run):

docker build -t t3ck-backup-runner:local .

docker run --rm \
  -e GCS_BUCKET=my-gcs-bucket \
  -e GCP_PROJECT=my-gcp-project \
  -e GOOGLE_APPLICATION_CREDENTIALS=/secrets/gcp-key.json \
  -v /path/to/gcp-key.json:/secrets/gcp-key.json:ro \
  -e REDIS_HOST=redis.example.com \
  -e S3_BUCKET=my-s3-bucket \
  t3ck-backup-runner:local

CI/CD:
- The supplied GitHub Actions workflow will build and push to `ghcr.io/<org>/t3ck-backup-runner:latest`.
