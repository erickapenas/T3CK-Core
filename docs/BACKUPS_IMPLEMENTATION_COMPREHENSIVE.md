# Automated Backups Implementation Guide

## Overview

Automated Backups is a critical component for production systems that enables reliable data recovery. This implementation provides:

- ✅ **Firestore Exports** to Google Cloud Storage (GCS)
- ✅ **Redis Snapshots** to Amazon S3
- ✅ **Scheduled Execution** via node-cron
- ✅ **Monitoring & Alerting** via Prometheus and Winston logging
- ✅ **Error Handling** with graceful degradation

**Status**: ✅ Implemented and tested (Semana 2, Day 6)  
**Implementation**: Backup manager with Firestore + Redis support  
**Build Status**: ✅ All services compile successfully  
**Timeline**: 3 hours estimated, ~1.5 hours actual

## Architecture

### Design Pattern: Backup Manager with Multi-Source Support

```
Service Startup
├─ Initialize BackupManager (Singleton)
├─ Load configuration from environment
├─ Setup Prometheus metrics
└─ Register graceful shutdown handler
        ↓
    Backup Scheduler
    ├─ Schedule backups (daily at 2 AM by default)
    └─ Execute on schedule or manual trigger
        ↓
    BackupManager.runBackupNow()
    ├─ Backup Firestore
    │  └─ gcloud firestore export → GCS
    │     └─ gs://<bucket>/firestore-<timestamp>
    ├─ Backup Redis
    │  ├─ redis-cli SAVE
    │  └─ aws s3 cp dump.rdb → S3
    │     └─ s3://<bucket>/redis-<timestamp>/dump.rdb
    └─ Log results, update metrics
```

### Core Components

#### 1. BackupManager Class (Singleton)

**Location**: `packages/shared/src/backup.ts` (371 lines)

**Responsibilities**:
- Manage backup execution
- Handle Firestore exports
- Handle Redis snapshots
- Schedule automatic backups
- Monitor backup health
- Graceful error handling

**Key Methods**:
```typescript
class BackupManager {
  async runBackupNow(): Promise<BackupResult>
  scheduleBackups(cronExpression?: string): void
  getStatus(): BackupStatus
  async close(): Promise<void>
  
  private async backupFirestore(timestamp: Date): Promise<void>
  private async backupRedis(timestamp: Date): Promise<void>
}
```

#### 2. BackupConfig Interface

```typescript
interface BackupConfig {
  enabled: boolean;                    // Enable/disable backups
  gcpProject?: string;                 // GCP project ID
  gcsBucket?: string;                  // GCS bucket name
  s3Bucket?: string;                   // S3 bucket name
  redisHost?: string;                  // Redis host
  redisPort?: number;                  // Redis port
  redisDumpPath?: string;              // Path to dump.rdb
  firebaseProjectId?: string;          // Firebase project
  environment: string;                 // dev/staging/prod
}
```

#### 3. BackupResult Interface

```typescript
interface BackupResult {
  success: boolean;
  timestamp: Date;
  duration: number;                    // Duration in ms
  firestore?: {
    success: boolean;
    path?: string;
    error?: string;
  };
  redis?: {
    success: boolean;
    path?: string;
    error?: string;
  };
  totalSize?: number;
}
```

#### 4. BackupStatus Interface

```typescript
interface BackupStatus {
  enabled: boolean;
  isRunning: boolean;
  environment: string;
  lastBackup?: {
    timestamp: Date;
    success: boolean;
    duration: number;
  };
  capabilities: {
    firestore: boolean;
    redis: boolean;
  };
}
```

## Implementation Details

### Files Changed

```
packages/shared/src/backup.ts          (371 lines, new)
packages/shared/src/index.ts           (1 line added)
services/auth-service/src/backup.ts    (updated wrapper)
services/webhook-service/src/backup.ts (updated wrapper)
services/tenant-service/src/backup.ts  (updated wrapper)
```

### Service Integration

Each service has a wrapper that imports from shared:

**auth-service/src/backup.ts**:
```typescript
export { BackupManager, initializeBackups, getBackupManager } from '@t3ck/shared';
export async function runBackupNow() { /* delegates to shared */ }
export function getBackupStatus() { /* delegates to shared */ }
```

**Same pattern for**: webhook-service, tenant-service

### Firestore Backup

Backs up Firestore data to Google Cloud Storage using `gcloud` CLI:

```bash
gcloud firestore export gs://<bucket>/firestore-backups/<project>/<timestamp> \
  --project=<project>
```

**Flow**:
1. Create timestamped GCS path: `gs://<bucket>/firestore-<YYYYMMDD-HHMM>/`
2. Execute `gcloud firestore export` command with timeout
3. Verify command success (exit code 0)
4. Log result with timestamp and path

**Requirements**:
- `gcloud` CLI installed in container
- GCP service account with `roles/datastore.importExportAdmin`
- `roles/storage.objectCreator` on GCS bucket
- Environment variables: `GCP_PROJECT`, `BACKUP_GCS_BUCKET`

### Redis Backup

Backs up Redis data to Amazon S3:

1. Execute `redis-cli SAVE` to create dump.rdb
2. Upload dump.rdb to S3 using `aws s3 cp`

```bash
redis-cli -h <host> -p <port> SAVE
aws s3 cp <dump-path> s3://<bucket>/redis-backups/<timestamp>/dump.rdb
```

**Flow**:
1. Connect to Redis via redis-cli
2. Execute SAVE command (blocking until snapshot complete)
3. Verify dump.rdb exists at configured path
4. Upload to S3 with AWS CLI
5. Log results

**Requirements**:
- `redis-cli` installed in container
- `aws` CLI installed in container
- IAM role with S3 PutObject permissions
- Environment variables: `REDIS_HOST`, `REDIS_PORT`, `REDIS_DUMP_PATH`, `BACKUP_S3_BUCKET`

### Backup Scheduling

Uses node-cron for scheduled execution:

```typescript
// Default: daily at 2 AM UTC
getBackupManager().scheduleBackups('0 2 * * *');

// Custom schedule
getBackupManager().scheduleBackups('0 */4 * * *'); // Every 4 hours

// Without cron (manual only)
// Don't call scheduleBackups()
```

Cron format: `minute hour dayOfMonth month dayOfWeek`

**Note**: node-cron is optional dependency. If not available, manual triggers work via `runBackupNow()`.

## Usage Guide

### 1. Initialize Backups at Service Startup

```typescript
// In main service file (auth.ts, index.ts, etc.)
import { initializeBackups, getBackupManager } from '@t3ck/shared';

async function startService() {
  // ... other initialization ...
  
  // Initialize backup manager
  await initializeBackups();
  
  // Schedule automatic backups (daily at 2 AM UTC)
  const manager = getBackupManager();
  manager.scheduleBackups('0 2 * * *');
  
  // Log backup status
  const status = manager.getStatus();
  logger.info('Backup initialized', {
    enabled: status.enabled,
    capabilities: status.capabilities,
  });
}
```

### 2. Manual Backup Trigger

```typescript
import { getBackupManager } from '@t3ck/shared';

async function triggerBackup() {
  const manager = getBackupManager();
  const result = await manager.runBackupNow();

  console.log(`Backup ${result.success ? 'succeeded' : 'failed'}`);
  console.log(`Duration: ${result.duration}ms`);
  console.log(`Firestore: ${result.firestore?.path || 'skipped'}`);
  console.log(`Redis: ${result.redis?.path || 'skipped'}`);
  
  // Example result:
  // {
  //   success: true,
  //   timestamp: 2026-02-02T14:30:00Z,
  //   duration: 45000,
  //   firestore: {
  //     success: true,
  //     path: 'gs://my-backup/firestore-20260202-1430/'
  //   },
  //   redis: {
  //     success: true,
  //     path: 's3://my-backup/redis-20260202-1430/dump.rdb'
  //   }
  // }
}
```

### 3. Monitor Backup Status

```typescript
import { getBackupManager } from '@t3ck/shared';

function checkBackupHealth() {
  const manager = getBackupManager();
  const status = manager.getStatus();

  console.log({
    enabled: status.enabled,
    running: status.isRunning,
    environment: status.environment,
    lastBackup: status.lastBackup ? {
      timestamp: status.lastBackup.timestamp,
      success: status.lastBackup.success,
      duration: status.lastBackup.duration + 'ms',
    } : 'never',
    capabilities: {
      firestore: status.capabilities.firestore,
      redis: status.capabilities.redis,
    },
  });
}
```

### 4. HTTP Endpoint (Optional)

```typescript
import express from 'express';
import { getBackupManager } from '@t3ck/shared';

const router = express.Router();

// Trigger backup manually
router.post('/admin/backup/now', async (req, res) => {
  try {
    const manager = getBackupManager();
    const result = await manager.runBackupNow();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get backup status
router.get('/admin/backup/status', (req, res) => {
  const manager = getBackupManager();
  res.json(manager.getStatus());
});

app.use(router);
```

## Configuration

### Environment Variables

```bash
# Enable/disable backups (default: true)
BACKUPS_ENABLED=true

# Firestore configuration
GCP_PROJECT=my-gcp-project
BACKUP_GCS_BUCKET=my-backup-bucket

# Redis configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DUMP_PATH=/data/dump.rdb

# S3 configuration
BACKUP_S3_BUCKET=my-s3-backup-bucket
AWS_REGION=us-east-1

# Firebase (optional)
FIREBASE_PROJECT_ID=my-firebase-project

# Custom cron schedule (optional)
BACKUP_CRON_SCHEDULE=0 2 * * *  # Default: daily at 2 AM UTC
```

### Configuration Priority

1. Environment variables (highest priority)
2. Service account credentials files
3. Default values (lowest priority)

### Example: Docker Compose

```yaml
services:
  auth-service:
    image: my-registry/auth-service:latest
    environment:
      GCP_PROJECT: my-gcp-project
      BACKUP_GCS_BUCKET: my-backup-bucket
      BACKUP_S3_BUCKET: my-s3-backup-bucket
      REDIS_HOST: redis
      REDIS_PORT: 6379
      REDIS_DUMP_PATH: /data/dump.rdb
      AWS_REGION: us-east-1
    volumes:
      - /data:/data  # For Redis dump
      - /root/.config/gcloud:/root/.config/gcloud  # For gcloud auth

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - /data:/data
```

## Prometheus Metrics

### Available Metrics

**Counters**:
```
backup_attempts_total              # Total backup attempts
backup_failures_total              # Total backup failures
```

**Gauges**:
```
backup_last_timestamp_seconds      # Unix timestamp of last successful backup
backup_duration_seconds            # Duration of last backup in seconds
```

### Example Prometheus Configuration

```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'auth-service'
    static_configs:
      - targets: ['localhost:9090']
    metrics_path: '/metrics'
```

### Example Queries

```promql
# Backup success rate over last 5 minutes
rate(backup_attempts_total[5m]) - rate(backup_failures_total[5m])

# Backup failure rate
rate(backup_failures_total[5m])

# Backup duration (last 5 minutes average)
avg_over_time(backup_duration_seconds[5m])

# Time since last backup (in seconds)
time() - backup_last_timestamp_seconds

# Alert: No backup in 25 hours
time() - backup_last_timestamp_seconds > 90000
```

### Grafana Dashboard

Create dashboard with:
- Success/failure rate gauge
- Last backup timestamp
- Backup duration histogram
- Failure count trend

## IAM & Permissions

### GCP (Firestore Export)

Service account requires:
- `roles/datastore.importExportAdmin` - For export/import operations
- `roles/storage.objectCreator` on target GCS bucket

**Setup**:
```bash
# Create service account
gcloud iam service-accounts create backup-sa \
  --project=my-gcp-project

# Grant Firestore role
gcloud projects add-iam-policy-binding my-gcp-project \
  --member=serviceAccount:backup-sa@my-gcp-project.iam.gserviceaccount.com \
  --role=roles/datastore.importExportAdmin

# Grant Storage role on bucket
gsutil iam ch \
  serviceAccount:backup-sa@my-gcp-project.iam.gserviceaccount.com:objectCreator \
  gs://my-backup-bucket
```

**JSON Policy**:
```json
{
  "members": [
    "serviceAccount:backup-sa@my-gcp-project.iam.gserviceaccount.com"
  ],
  "roles": [
    "roles/datastore.importExportAdmin",
    "roles/storage.objectCreator"
  ]
}
```

### AWS (S3 Upload)

IAM role requires:
- `s3:PutObject` - Upload backup files
- `s3:ListBucket` - List bucket contents (optional)

**Setup**:
```bash
# Create IAM policy
aws iam create-policy --policy-name backup-s3-policy \
  --policy-document file://backup-policy.json

# Attach to role
aws iam attach-role-policy \
  --role-name backup-role \
  --policy-arn arn:aws:iam::123456789:policy/backup-s3-policy
```

**IAM Policy Document** (backup-policy.json):
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject"],
      "Resource": ["arn:aws:s3:::my-backup-bucket/*"]
    },
    {
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": ["arn:aws:s3:::my-backup-bucket"]
    }
  ]
}
```

## Testing

### Manual Local Testing

```bash
# 1. Set environment variables
export GCP_PROJECT=test-project
export BACKUP_GCS_BUCKET=test-backup-bucket
export BACKUP_S3_BUCKET=test-s3-bucket
export REDIS_HOST=localhost
export REDIS_PORT=6379
export REDIS_DUMP_PATH=/tmp/dump.rdb

# 2. Start Redis locally
docker run -d -p 6379:6379 redis:7-alpine

# 3. Run backup in Node REPL
node << 'EOF'
const { getBackupManager, initializeBackups } = require('@t3ck/shared');

(async () => {
  await initializeBackups();
  const mgr = getBackupManager();
  const result = await mgr.runBackupNow();
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
})();
EOF
```

### Docker Testing

```bash
# Build service
docker build -t my-service:test .

# Run with environment
docker run \
  -e GCP_PROJECT=test-project \
  -e BACKUP_GCS_BUCKET=test-bucket \
  -e REDIS_HOST=host.docker.internal \
  -e REDIS_PORT=6379 \
  -v /root/.config/gcloud:/root/.config/gcloud \
  my-service:test

# Inside service, trigger backup
curl -X POST http://localhost:3000/admin/backup/now
```

### Unit Testing

```typescript
// Example test
import { BackupManager } from '@t3ck/shared';

describe('BackupManager', () => {
  it('should execute backup successfully', async () => {
    const manager = new BackupManager({
      enabled: true,
      gcpProject: 'test-project',
      gcsBucket: 'test-bucket',
      s3Bucket: 'test-bucket',
      redisHost: 'localhost',
      redisPort: 6379,
      redisDumpPath: '/tmp/dump.rdb',
      environment: 'test',
    });

    const result = await manager.runBackupNow();
    expect(result.success).toBe(true);
    expect(result.firestore?.success).toBe(true);
    expect(result.redis?.success).toBe(true);
  });
});
```

## Production Deployment

### Cloud Scheduler (GCP)

Schedule backups via Cloud Scheduler:

```bash
gcloud scheduler jobs create http daily-backup \
  --schedule="0 2 * * *" \
  --uri="https://my-service/admin/backup/now" \
  --http-method=POST \
  --location=us-central1 \
  --oidc-service-account-email=backup-sa@my-project.iam.gserviceaccount.com \
  --oidc-token-audience=https://my-service
```

### EventBridge (AWS)

Schedule backups using EventBridge:

```json
{
  "Name": "daily-backup",
  "ScheduleExpression": "cron(0 2 * * ? *)",
  "State": "ENABLED",
  "Targets": [
    {
      "Arn": "arn:aws:ecs:us-east-1:123456789:task-definition/backup-task",
      "RoleArn": "arn:aws:iam::123456789:role/eventbridge-role",
      "EcsParameters": {
        "TaskDefinitionArn": "arn:aws:ecs:...",
        "LaunchType": "FARGATE",
        "NetworkConfiguration": {
          "AwsVpcConfiguration": {
            "Subnets": ["subnet-xxx"],
            "SecurityGroups": ["sg-xxx"],
            "AssignPublicIp": "ENABLED"
          }
        }
      }
    }
  ]
}
```

### Kubernetes CronJob

Schedule backups in Kubernetes:

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: backup-job
  namespace: default
spec:
  schedule: "0 2 * * *"  # 2 AM UTC daily
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 3
  jobTemplate:
    spec:
      activeDeadlineSeconds: 3600  # 1 hour timeout
      template:
        spec:
          serviceAccountName: backup-sa
          restartPolicy: OnFailure
          containers:
          - name: backup
            image: my-registry/auth-service:latest
            imagePullPolicy: IfNotPresent
            command: ["/bin/sh"]
            args:
            - -c
            - |
              curl -X POST http://auth-service:3000/admin/backup/now \
                -H "Content-Type: application/json" \
                || exit 1
            env:
            - name: GCP_PROJECT
              valueFrom:
                configMapKeyRef:
                  name: backup-config
                  key: gcp-project
            - name: BACKUP_GCS_BUCKET
              valueFrom:
                configMapKeyRef:
                  name: backup-config
                  key: gcs-bucket
            - name: BACKUP_S3_BUCKET
              valueFrom:
                secretKeyRef:
                  name: backup-secrets
                  key: s3-bucket
            - name: AWS_REGION
              value: "us-east-1"
            resources:
              requests:
                memory: "256Mi"
                cpu: "250m"
              limits:
                memory: "512Mi"
                cpu: "500m"
```

## Monitoring & Alerting

### CloudWatch Alarms (AWS)

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name backup-failure-rate \
  --metric-name backup_failures_total \
  --namespace t3ck-core \
  --statistic Sum \
  --period 3600 \
  --evaluation-periods 1 \
  --threshold 1 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --alarm-actions arn:aws:sns:us-east-1:123456789:backup-alerts
```

### Cloud Logging (GCP)

```
resource.type="k8s_container"
resource.labels.namespace_name="default"
severity="ERROR"
jsonPayload.logger="backup-manager"
```

### Winston Logging

All backup operations logged with:
- Timestamp (ISO 8601)
- Service name
- Operation type
- Status (success/failure)
- Duration (milliseconds)
- Error details (if failed)
- Custom context fields

**Example logs**:
```
[2026-02-02T14:30:00.123Z] [auth-service] backup-start: Firestore backup starting
[2026-02-02T14:30:45.456Z] [auth-service] backup-complete: Firestore export succeeded in 45333ms
[2026-02-02T14:30:50.789Z] [auth-service] backup-complete: Redis backup succeeded in 5333ms
[2026-02-02T14:30:51.012Z] [auth-service] backup-result: Overall backup successful (50666ms)
```

## Troubleshooting

### Firestore Backup Fails

**Problem**: `gcloud` permission error
```
ERROR: (gcloud.firestore.export) User does not have permission
```

**Solution**:
1. Verify GCP_PROJECT environment variable is set
2. Check service account has `roles/datastore.importExportAdmin`
3. Verify GCS bucket exists and service account has `roles/storage.objectCreator`
4. Authenticate gcloud: `gcloud auth login` or use service account key
5. Test gcloud command manually: `gcloud firestore export gs://<bucket>/test --project=<project>`

### Redis Backup Fails

**Problem**: `redis-cli SAVE` fails
```
ERROR: Could not connect to Redis at 127.0.0.1:6379
```

**Solution**:
1. Verify REDIS_HOST and REDIS_PORT are correct
2. Check Redis is running: `redis-cli -h <host> -p <port> ping`
3. Verify redis-cli is installed in container: `which redis-cli`
4. Check network connectivity: `telnet <host> <port>`
5. For managed Redis (ElastiCache), check SAVE is enabled in parameter group

### S3 Upload Fails

**Problem**: IAM permission error
```
An error occurred (AccessDenied) when calling the PutObject operation
```

**Solution**:
1. Verify BACKUP_S3_BUCKET environment variable is set
2. Check IAM role/user has `s3:PutObject` permission on bucket
3. Verify AWS credentials configured: `aws sts get-caller-identity`
4. Check AWS_REGION matches bucket location
5. Verify S3 bucket exists: `aws s3 ls s3://<bucket>`

### Node-cron Not Available

**Problem**: Scheduling fails if node-cron not installed
```
ERROR: node-cron not available for scheduling
```

**Solution**:
1. Install node-cron: `npm install node-cron` or `pnpm add node-cron`
2. Or use external scheduler (Cloud Scheduler, EventBridge, K8s CronJob)
3. Manual triggers via `runBackupNow()` still work without node-cron

## Best Practices

### 1. Schedule Backups During Off-Peak Hours
- Backup operations are I/O intensive
- Schedule during low traffic periods (e.g., 2 AM UTC)
- Avoid peak business hours

### 2. Implement Restore Testing
- Regularly test backup restoration
- Validate data integrity after restore
- Document recovery procedure
- Perform quarterly disaster recovery drills

### 3. Monitor Backup Success
- Setup alerts for backup failures
- Track backup duration and size
- Monitor Prometheus metrics
- Keep retention policies updated

### 4. Secure Backup Storage
- Enable encryption at rest (GCS/S3)
- Use bucket versioning
- Limit access via IAM policies
- Archive old backups to cheaper storage tiers
- Rotate credentials regularly

### 5. Document Recovery Procedure
- Write runbook for disaster recovery
- Test recovery procedure quarterly
- Keep backup manifests with metadata
- Document restore time objectives (RTO) and recovery point objectives (RPO)

### 6. Backup Size Management
- Monitor backup sizes
- Implement retention policies (e.g., keep 30 days)
- Archive to Glacier/deep-archive for older backups
- Clean up incomplete backups

## Summary

Automated Backups implementation provides:

✅ **Firestore Exports** to GCS with timestamped paths  
✅ **Redis Snapshots** to S3 with error handling  
✅ **Scheduled Execution** via node-cron (optional)  
✅ **Monitoring** with Prometheus metrics  
✅ **Logging** with Winston and full context  
✅ **Graceful Degradation** when dependencies unavailable  
✅ **Multi-service Integration** via shared module pattern  

**Build Status**: ✅ All services compile successfully  
**Test Status**: ✅ Ready for production deployment  
**Performance**: Firestore export (1-5 min), Redis snapshot (seconds)  
**Git Commit**: `6a28ff3` - feat: implement automated backups with firestore and redis support  

---

**Last Updated**: February 2, 2026  
**Implemented By**: T3CK Development Team  
**Version**: 1.0 (Production Ready)
