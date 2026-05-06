# Bull Queue - Testing Quick Start

## Start Services

### Terminal 1: Start Tenant Service

```bash
cd c:\Users\erick\Desktop\T3CK Core\services\tenant-service
pnpm dev
```

Expected output:

```
tenant service running on port 3003
Queue Redis client connected
Tracing initialized: tenant-service
```

---

## Test Bull Queue

### Terminal 2: Submit Provisioning Job

```bash
curl -X POST http://localhost:3003/provisioning/submit \
  -H "Content-Type: application/json" \
  -d '{
    "domain": "example.com",
    "companyName": "Example Corporation",
    "contactEmail": "admin@example.com",
    "numberOfSeats": 50
  }'
```

Expected response:

```json
{
  "success": true,
  "data": {
    "id": "tenant-123",
    "domain": "example.com",
    "companyName": "Example Corporation",
    "contactEmail": "admin@example.com",
    "numberOfSeats": 50,
    "createdAt": "2026-02-02T17:44:39.194Z"
  },
  "jobId": "job-abc123",
  "message": "Form submitted successfully. Provisioning will begin shortly."
}
```

---

### Check Queue Statistics

```bash
curl http://localhost:3003/queue/stats
```

Expected response:

```json
{
  "queueName": "provisioning",
  "waiting": 0,
  "active": 0,
  "completed": 1,
  "failed": 0,
  "delayed": 0,
  "total": 1
}
```

---

### Submit Multiple Jobs

```bash
# Submit 5 jobs in rapid succession
for i in {1..5}; do
  curl -X POST http://localhost:3003/provisioning/submit \
    -H "Content-Type: application/json" \
    -d "{
      \"domain\": \"company$i.com\",
      \"companyName\": \"Company $i\",
      \"contactEmail\": \"admin@company$i.com\",
      \"numberOfSeats\": $((50 + i * 10))
    }"
  sleep 0.1
done

# Check stats while processing
curl http://localhost:3003/queue/stats
```

---

## Monitor in Service Logs

Watch the tenant service logs for:

```
Processing provisioning job { jobId: 'job-123', tenantId: 'tenant-456' }
Job enqueued { jobId: 'job-123', queueName: 'provisioning', jobName: 'provision-tenant' }
Job completed { jobId: 'job-123', queueName: 'provisioning', duration: 2000 }
```

---

## Verify Build

```bash
cd c:\Users\erick\Desktop\T3CK Core
pnpm build

# Should see:
# ✅ packages/sdk: Done in 457ms
# ✅ packages/shared: Done in 897ms
# ✅ services/auth: Done in 1.7s
# ✅ services/tenant: Done in 1.3s
# ✅ services/webhook: Done in 1.4s
```

---

## Run Tests

```bash
cd c:\Users\erick\Desktop\T3CK Core

# Run all tests
pnpm test

# Or specific service
cd services/tenant-service
pnpm test
```

Expected: 17/17 tests passing

---

## Common Issues & Solutions

### Issue: Redis connection timeout

```
Error: connect ECONNREFUSED 127.0.0.1:6379
```

**Solution**: Start Redis

```bash
# Windows: If using WSL or Docker
docker run -d -p 6379:6379 redis:7
# Or check if Redis is installed locally
redis-server
```

### Issue: Port 3003 already in use

```
Error: listen EADDRINUSE :::3003
```

**Solution**: Kill process on port 3003

```bash
# PowerShell
Get-Process -Id (Get-NetTCPConnection -LocalPort 3003).OwningProcess | Stop-Process

# Or change port
PORT=3004 pnpm dev
```

### Issue: No jobs being processed

**Solution**: Check logs for worker creation:

```
Worker created for queue: provisioning
```

If not present, the worker wasn't created. Check:

1. Redis connection active
2. No console errors
3. Queue stats show jobs (waiting > 0)

---

## Performance Testing

### Load Test - 100 Jobs

```bash
# Submit 100 jobs
for i in {1..100}; do
  curl -X POST http://localhost:3003/provisioning/submit \
    -H "Content-Type: application/json" \
    -d "{\"domain\":\"test$i.com\",\"companyName\":\"Test $i\",\"contactEmail\":\"admin@test$i.com\",\"numberOfSeats\":10}" &
done

# Wait for completion
sleep 10

# Check final stats
curl http://localhost:3003/queue/stats
```

Expected: All 100 jobs completed in ~20 seconds (2 concurrent workers × 2 seconds each)

---

## API Reference

### Endpoints

#### Submit Provisioning Form

```
POST /provisioning/submit
Content-Type: application/json

Request Body:
{
  "domain": "string (required, domain.com format)",
  "companyName": "string (required, 3-100 chars)",
  "contactEmail": "string (required, valid email)",
  "numberOfSeats": "number (required, 1-10000)"
}

Response:
{
  "success": boolean,
  "data": { tenant object },
  "jobId": "string (unique job identifier)",
  "message": "string"
}
```

#### Get Queue Statistics

```
GET /queue/stats

Response:
{
  "queueName": "provisioning",
  "waiting": number,
  "active": number,
  "completed": number,
  "failed": number,
  "delayed": number,
  "total": number
}
```

#### Get Provisioning Status

```
GET /provisioning/:tenantId/status

Response:
{
  "tenantId": "string",
  "status": "PENDING|ACTIVE|FAILED",
  "message": "string"
}
```

---

## Documentation References

1. **[BULL_QUEUE_IMPLEMENTATION.md](./BULL_QUEUE_IMPLEMENTATION.md)** - Complete technical guide
2. **[BULL_QUEUE_QUICK_REFERENCE.md](./BULL_QUEUE_QUICK_REFERENCE.md)** - Code examples
3. **[SEMANA1_WEEK1_SUMMARY.md](./SEMANA1_WEEK1_SUMMARY.md)** - Full week summary
4. **[SESSION3_COMPLETION_SUMMARY.md](./SESSION3_COMPLETION_SUMMARY.md)** - Session overview

---

## Next: Database Migrations

After testing Bull Queue, the next critical item is Database Migrations:

- [ ] Choose ORM (TypeORM or Knex)
- [ ] Design database schema
- [ ] Implement migration runner
- [ ] Integrate with service startup

This will complete Semana 1 (100% of 6 critical items).

---

**Last Updated**: February 2, 2026  
**Status**: ✅ Ready for Testing
