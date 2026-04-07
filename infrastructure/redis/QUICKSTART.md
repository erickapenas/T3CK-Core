# Redis Sentinel Quick Start Guide

## Overview

This guide provides quick instructions to set up and test Redis Sentinel locally or in production.

---

## Local Development Setup

### 1. Start the Docker Compose Stack

```bash
cd infrastructure/docker/redis-sentinel

# Start all Redis + Sentinel containers
docker-compose up -d

# View logs
docker-compose logs -f

# Verify containers are running
docker-compose ps
```

### 2. Test Sentinel Cluster

```bash
# Connect to Sentinel 1
redis-cli -p 26379

# Inside redis-cli:
SENTINEL masters        # List all monitored masters
SENTINEL slaves t3ck-redis-master  # List replicas
SENTINEL sentinels t3ck-redis-master  # List other sentinels
INFO sentinel           # Get Sentinel info
```

### 3. Test Redis Master/Replica Connectivity

```bash
# Connect to master
redis-cli -h localhost -p 6379 -a redis123
PING
SET mykey "hello"
GET mykey

# Connect to replica
redis-cli -h localhost -p 6380 -a redis123
GET mykey  # Should return "hello"

# Check replication info
INFO replication
```

### 4. Simulate Master Failure

```bash
# In a terminal, stop the master
docker-compose stop redis-master

# Watch Sentinel detect the failure
# In another terminal:
docker-compose logs -f redis-sentinel-1

# After ~30 seconds, Sentinel should promote a replica

# Check which instance is now master
redis-cli -p 26379 SENTINEL masters

# Restart the old master (it will become a replica)
docker-compose start redis-master

# Verify replication resumed
redis-cli -h localhost -p 6379 -a redis123 INFO replication
```

---

## GCP Cloud Run Deployment

### 1. Build Sentinel Image

```bash
cd infrastructure/docker/redis-sentinel

# Build Docker image
docker build -t gcr.io/$PROJECT_ID/redis-sentinel:latest .

# Push to Google Container Registry
docker push gcr.io/$PROJECT_ID/redis-sentinel:latest
```

### 2. Deploy Sentinel Instances

```bash
#!/bin/bash

PROJECT_ID="t3ck-core-prod"
REGION="us-central1"
REDIS_MASTER_IP="10.0.0.5"  # Replace with your Redis master IP

# Deploy 3 Sentinel instances
for i in 1 2 3; do
  SERVER_NAME="redis-sentinel-$i"

  gcloud run deploy $SERVER_NAME \
    --image gcr.io/$PROJECT_ID/redis-sentinel:latest \
    --platform managed \
    --region=$REGION \
    --memory 512Mi \
    --cpu 1 \
    --concurrency 1 \
    --no-allow-unauthenticated \
    --vpc-connector=t3ck-connector \
    --set-env-vars \
      REDIS_MASTER_IP=$REDIS_MASTER_IP,\
      REDIS_MASTER_PORT=6379,\
      SENTINEL_PORT=26379,\
      SENTINEL_QUORUM=2 \
    --project=$PROJECT_ID
done

echo "✅ Sentinel instances deployed!"
```

### 3. Configure Firewall Rules

```bash
# Allow Cloud Run to communicate with Redis
gcloud compute firewall-rules create allow-sentinel-to-redis \
  --allow tcp:6379,tcp:26379 \
  --source-ranges 0.0.0.0/0 \
  --target-tags redis-master,redis-replica \
  --project=$PROJECT_ID

# Restrict to VPC for security
gcloud compute firewall-rules create allow-sentinel-internal \
  --allow tcp:26379 \
  --source-ranges 10.0.0.0/8 \
  --target-tags sentinel \
  --project=$PROJECT_ID
```

---

## Production Deployment Recommendation

For production, **use GCP Memorystore** instead of self-hosted Sentinel:

```bash
# Create HA Memorystore instance
gcloud redis instances create t3ck-redis-ha \
  --project=$PROJECT_ID \
  --region=us-central1 \
  --size=4GB \
  --tier=standard \
  --replica-count=2 \
  --enable-auth \
  --redis-version=7.0 \
  --transit-encryption-mode=SERVER_AUTHENTICATION

# Get connection string
gcloud redis instances describe t3ck-redis-ha \
  --region=us-central1 \
  --format='value(host):value(port)'
```

**Benefits**:
- ✅ Google-managed HA and failover
- ✅ Automatic backups
- ✅ Built-in monitoring
- ✅ Lower operational overhead
- ✅ Compliance with SLAs

---

## Monitoring and Alerts

### 1. Check Sentinel Health

```bash
# From one of your app instances:
./infrastructure/redis/scripts/check-sentinel-health.sh

# Or manually:
redis-cli -h sentinel-1 -p 26379 PING
redis-cli -h sentinel-1 -p 26379 SENTINEL masters
```

### 2. Set Up Google Cloud Monitoring

```bash
# Monitor Redis metrics
gcloud monitoring dashboards create --config-from-file=infrastructure/redis/monitoring/redis-monitor.json

# Create alerts for failover
gcloud alpha monitoring policies create --notification-channels=<CHANNEL_ID> \
  --display-name="Redis Failover Alert" \
  --condition-threshold=1 \
  --condition-threshold-filter='resource.type="redis_instance"'
```

### 3. Monitor Sentinel Logs

```bash
# View Sentinel logs on Cloud Run
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=redis-sentinel-1" \
  --limit=50 \
  --format=json

# Filter for failover events
gcloud logging read "textPayload:failover" \
  --limit=50 \
  --format=json
```

---

## Troubleshooting

### Sentinel isn't promoting replica

```bash
# Check quorum
redis-cli -p 26379 SENTINEL masters

# Verify replicas are connected
redis-cli -p 26379 SENTINEL slaves t3ck-redis-master

# Check Sentinel logs
docker-compose logs redis-sentinel-1

# Restart a Sentinel
docker-compose restart redis-sentinel-1
```

### Connection timeouts

```bash
# Verify Redis is accepting connections
redis-cli -h redis-master -p 6379 -a redis123 PING

# Check firewall rules
gcloud compute firewall-rules list --filter="target-tags:redis-master"

# Verify VPC connectivity
gcloud compute ssh <instance-name> -- redis-cli -h 10.0.0.5 -p 6379 PING
```

### High replication lag

```bash
# Check replica offset
redis-cli -h redis-replica-1 -p 6379 -a redis123 INFO replication

# Monitor network latency
docker-compose exec redis-master ping -c 4 redis-replica-1

# Check master load
redis-cli -h redis-master -p 6379 -a redis123 INFO stats
```

---

## Environment Variables

Copy `.env.sentinel` to your deployment:

```bash
# Copy to cloud
gsutil cp infrastructure/redis/.env.sentinel gs://t3ck-config/

# Update Cloud Run services
gcloud run services update api-gateway \
  --set-env-vars SENTINEL_ENABLED=true,SENTINEL_HOST_1=sentinel-1:26379
```

---

## Next Steps

1. **Today**: Test locally with docker-compose
2. **Tomorrow**: Deploy Sentinel to staging on Cloud Run
3. **Week 1**: Run failover tests in staging
4. **Week 2**: Deploy to production
5. **Ongoing**: Monitor health and test monthly

---

## Useful Commands

```bash
# Local testing
docker-compose logs -f redis-sentinel-1
docker-compose exec redis-sentinel-1 redis-cli -p 26379 SENTINEL masters

# Production monitoring
gcloud logging read "redis-sentinel" --limit=20
gcloud redis instances list --region=us-central1

# Failover test
gcloud redis instances failover t3ck-redis-ha --region=us-central1

# Connection test
redis-cli -h SENTINEL_HOST -p 26379 PING
redis-cli -h REDIS_MASTER_IP -p 6379 -a PASSWORD PING
```

---

**Last Updated**: 2026-04-07
**Status**: Ready for Implementation
**Maintained By**: DevOps Team
