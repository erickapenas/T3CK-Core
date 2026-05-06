# Bull Queue Quick Reference

## Installation

```bash
pnpm add -w bullmq ioredis
```

## Basic Usage

### Create a Queue

```typescript
import { createQueue, createWorker, enqueueJob, getQueueStats } from '@t3ck/shared';

// Initialize queue
const queue = createQueue('my-queue');

// Create worker
const worker = createWorker(
  'my-queue',
  async (job) => {
    console.log(`Processing job ${job.id}:`, job.data);
    // Do work here
    return { result: 'success' };
  },
  2
); // 2 concurrent jobs
```

### Enqueue a Job

```typescript
const jobId = await enqueueJob('my-queue', 'job-name', {
  data: 'some data',
  userId: '123',
});

console.log(`Job enqueued: ${jobId}`);
```

### Queue Statistics

```typescript
const stats = await getQueueStats('my-queue');
console.log(`
  Waiting: ${stats.waiting}
  Active: ${stats.active}
  Completed: ${stats.completed}
  Failed: ${stats.failed}
  Total: ${stats.total}
`);
```

### Graceful Shutdown

```typescript
import { closeQueues } from '@t3ck/shared';

process.on('SIGTERM', async () => {
  await closeQueues();
  process.exit(0);
});
```

## Provisioning Queue (Tenant Service)

### Submit Provisioning Job

```bash
curl -X POST http://localhost:3003/provisioning/submit \
  -H "Content-Type: application/json" \
  -d '{
    "domain": "example.com",
    "companyName": "Example Corp",
    "contactEmail": "admin@example.com",
    "numberOfSeats": 50
  }'
```

Response:

```json
{
  "success": true,
  "data": { "id": "tenant-123", "domain": "example.com" },
  "jobId": "job-456",
  "message": "Form submitted successfully. Provisioning will begin shortly."
}
```

### Check Queue Status

```bash
curl http://localhost:3003/queue/stats
```

Response:

```json
{
  "queueName": "provisioning",
  "waiting": 2,
  "active": 1,
  "completed": 45,
  "failed": 0,
  "delayed": 0,
  "total": 48
}
```

## Configuration

### Environment Variables

```bash
REDIS_HOST=localhost      # Redis hostname
REDIS_PORT=6379           # Redis port
```

### Job Options

```typescript
await enqueueJob('queue-name', 'job-name', data, {
  delay: 5000, // Delay 5 seconds
  priority: 1, // Higher priority = processed first
  jobId: 'custom-id', // Custom job ID
});
```

### Worker Options

```typescript
createWorker('queue-name', processor, {
  concurrency: 2, // Process 2 jobs concurrently
  connection: redisConnection, // Custom Redis connection
});
```

## Job Lifecycle

```
Job Created
    ↓
[Queued] → Waiting in queue
    ↓
[Processing] → Worker picks up job
    ↓
Success?
  Yes → [Completed] → Auto-removed after 1 hour
  No  → [Retry] → Exponential backoff (2s, 4s, 8s)
       → Still failing? → [Failed] → Kept for 24 hours
```

## Retry Strategy

- **Attempts**: 3 (default)
- **Backoff**: Exponential
  - 1st retry: 2 seconds
  - 2nd retry: 4 seconds
  - 3rd retry: 8 seconds

## Common Patterns

### Priority Jobs

```typescript
// High priority - process immediately
await enqueueJob('queue', 'urgent-job', data, { priority: 10 });

// Normal priority
await enqueueJob('queue', 'normal-job', data, { priority: 5 });

// Low priority - process later
await enqueueJob('queue', 'background-job', data, { priority: 1 });
```

### Delayed Jobs

```typescript
// Process in 5 minutes
await enqueueJob('queue', 'scheduled-job', data, { delay: 300000 });
```

### Idempotent Jobs

```typescript
// Same jobId = no duplicate if job exists
await enqueueJob('queue', 'backup-job', data, { jobId: 'backup-2026-02-02' });
```

## Monitoring

### Available Endpoints

- `/queue/stats` - Queue statistics (waiting, active, completed, failed)
- `/health` - Service health (checks all dependencies)
- `/metrics` - Prometheus metrics (includes custom job metrics)

### Logs to Watch

```json
{
  "message": "Job enqueued",
  "queueName": "provisioning",
  "jobId": "job-123",
  "jobName": "provision-tenant"
}
```

```json
{
  "message": "Job completed",
  "jobId": "job-123",
  "duration": 2000,
  "queueName": "provisioning"
}
```

## Troubleshooting

### Queue Not Processing Jobs

1. Check Redis connection: `redis-cli ping`
2. Verify worker is created: `console.log(getWorker('queue-name'))`
3. Check queue stats: `GET /queue/stats`
4. Review logs for worker errors

### Jobs Failing Repeatedly

1. Check job data in logs
2. Review error message: `logger.error` output
3. Use `getQueueStats` to see failed count
4. Inspect failed jobs (retained for 24 hours)

### Memory Issues

1. Increase job cleanup time (default: 1 hour)
2. Reduce worker concurrency
3. Check Redis memory: `redis-cli info memory`
4. Consider job data size optimization

### Performance Issues

1. Increase worker concurrency
2. Optimize processor function (await I/O, not CPU)
3. Monitor with `/metrics` endpoint
4. Add database indexing for worker queries

## Examples

### Email Queue

```typescript
createWorker(
  'emails',
  async (job) => {
    const { to, subject, body } = job.data;
    await emailService.send({ to, subject, body });
  },
  5
); // 5 concurrent emails
```

### Backup Queue

```typescript
await enqueueJob(
  'backups',
  'daily-backup',
  {
    type: 's3',
    bucket: 'my-backups',
    date: new Date().toISOString(),
  },
  { delay: 86400000 }
); // 24 hours
```

### Webhook Retry Queue

```typescript
createWorker(
  'webhooks',
  async (job) => {
    const response = await fetch(job.data.url, {
      method: 'POST',
      body: JSON.stringify(job.data.payload),
    });
    if (!response.ok) throw new Error('Webhook failed');
  },
  10
); // Process 10 webhooks concurrently
```

## Additional Resources

- [BullMQ Docs](https://docs.bullmq.io/)
- [T3CK Architecture](./docs/ARCHITECTURE.md)
- [Bull Queue Implementation](./BULL_QUEUE_IMPLEMENTATION.md)
- [Rate Limiting](./SEMANA1_RATE_LIMIT_TRACING_COMPLETO.md)
