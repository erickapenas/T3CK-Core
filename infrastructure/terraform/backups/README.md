Terraform Backup Scheduling Examples

This folder contains examples for scheduling backups:

- `gcp/` — Cloud Scheduler job that triggers a Cloud Run backup service to execute `gcloud firestore export`.
- `aws/` — EventBridge scheduled rule that triggers an ECS task (Fargate) to run Redis snapshot and upload to S3.

These are templates; fill in variables and integrate with your CI/CD.
