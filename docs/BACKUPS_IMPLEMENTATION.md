# Automated Backups Implementation

This document describes the automated backup design and operational guidance for T3CK Core services.

Scope
- Firestore exports to Google Cloud Storage (GCS)
- Redis snapshot exports to Amazon S3 (or equivalent object store)
- Local development using CLI tools or LocalStack

Prerequisites
- `gcloud` CLI configured and authenticated for GCP project
- `aws` CLI configured with appropriate IAM role/credentials
- `redis-cli` available in container runtime (or access to ElastiCache snapshot API)
- `GCP_PROJECT`, `BACKUP_GCS_BUCKET`, `BACKUP_S3_BUCKET`, `REDIS_HOST`, `REDIS_PORT`, `REDIS_DUMP_PATH` env vars

Design Summary
- `BackupManager.runBackupNow()` executes two operations:
  1. `gcloud firestore export gs://<GCS_BUCKET>/firestore-backups/<project>/<timestamp>`
  2. `redis-cli SAVE` then `aws s3 cp <dumpPath> s3://<S3_BUCKET>/redis-backups/<timestamp>/dump.rdb`
- Backup scheduling can be handled by Cloud Scheduler / EventBridge / cron jobs that call an administrative endpoint or invoke a Lambda/Task that triggers `runBackupNow()`.
- Backups are best-effort; failures are logged and retried via external scheduler.

IAM & Permissions

GCP (Service Account) - Firestore Export
- Recommended role bindings for the service account used by `gcloud`:
  - `roles/datastore.importExportAdmin` (for export/import)
  - `roles/storage.objectCreator` on the target bucket

Example IAM policy (GCP):
- Grant `roles/datastore.importExportAdmin` to the service account
- Grant `roles/storage.objectCreator` on `projects/_/buckets/<BACKUP_GCS_BUCKET>`

AWS (IAM) - S3 Upload for Redis Dump
- Recommended IAM policy for the role/task that uploads to S3:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:PutObjectAcl", "s3:ListBucket"],
      "Resource": [
        "arn:aws:s3:::YOUR_BACKUP_BUCKET",
        "arn:aws:s3:::YOUR_BACKUP_BUCKET/*"
      ]
    }
  ]
}
```

ElastiCache (snapshot-based) alternative
- If using ElastiCache for Redis, prefer automated snapshots via ElastiCache; grant IAM roles for snapshot export to S3 when supported.
- Otherwise use `redis-cli SAVE` on Redis instances that permit filesystem access.

Runtime CLI Requirements
- `gcloud` must be available in the container for Firestore export; or run export from a GCP Cloud Function/Cloud Run job with proper service account.
- `aws` CLI must be available or use AWS SDK to upload the dump programmatically.

Local Development
- For local testing, set env vars and run:

```bash
export GCP_PROJECT=your-gcp-project
export BACKUP_GCS_BUCKET=your-gcs-bucket
export BACKUP_S3_BUCKET=your-s3-bucket
export REDIS_HOST=127.0.0.1
export REDIS_PORT=6379
export REDIS_DUMP_PATH=/data/dump.rdb

# Trigger backup via direct Node call (example)
pnpm --filter services/auth-service run -- node -e "require('./dist/backup').getBackupManager().runBackupNow()"
```

(Prefer running inside service runtime where `backup` module is available.)

CI/CD / Scheduled Execution Patterns
- Option A (preferred): Run a scheduled job in Cloud (Cloud Scheduler → Pub/Sub → Cloud Run) to call a small backup runner service (Docker) that executes `gcloud` and `aws` CLI steps.
- Option B: Use ECS Fargate task scheduled by EventBridge to run backup container with AWS Role.
- Option C: Use a Lambda that triggers Firestore export via REST API and Redis backup via snapshot export flow (requires additional plumbing).

Example: Cloud Scheduler → Cloud Run flow (GCP)
1. Cloud Scheduler cron triggers Pub/Sub message daily at 02:00.
2. Cloud Run service subscribed to Pub/Sub receives the message and runs the `gcloud firestore export`.
3. Cloud Run can also call an internal endpoint on an authenticated service to trigger Redis upload to S3 if cross-cloud uploads required.

AWS EventBridge / ECS scheduled task (Redis snapshot + upload)
- Configure a scheduled EventBridge rule that runs an ECS task (task role with S3 privileges). The task executes `redis-cli SAVE` and `aws s3 cp`.

Security & Best Practices
- Use short-lived credentials / roles (IAM task roles, GCP service accounts).
- Encrypt backups at rest (GCS/S3 default encryption or manage CMKs).
- Limit S3/GCS bucket access with least privilege.
- Rotate and audit service accounts and keys regularly.

Monitoring & Alerts
- Emit logs for start/finish/failure of each backup run (already implemented via `Logger`).
- Add CloudWatch/Cloud Logging alert rules for repeated failures.
- Keep retention policies for backups and implement lifecycle rules (e.g., move to IA after 30 days).

Testing & Recovery
- Periodically perform a restore drill: import Firestore export to a staging project and verify data integrity.
- Validate Redis RDB by restoring to a test instance and running smoke checks.

Troubleshooting
- `gcloud` permission errors: validate service account roles and `GCP_PROJECT`.
- `redis-cli` errors: check network access and whether Redis allows `SAVE` (managed Redis may not allow direct filesystem access).
- `aws s3 cp` errors: check IAM role and bucket policy, region and CLI configuration.

Next steps (recommended)
- Add Cloud Scheduler / EventBridge deployment recipes to `infrastructure/` (CloudFormation/CDK/Terraform).
- Add automated restore validation job.
- Optionally implement backup upload via SDKs (Google Cloud Storage client / AWS SDK) to avoid shelling out to CLI.

---

**Last Updated:** Feb 2, 2026
