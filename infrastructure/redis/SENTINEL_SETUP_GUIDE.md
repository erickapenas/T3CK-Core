# Redis Sentinel High Availability Setup Guide

## Overview

This guide provides comprehensive instructions for setting up Redis Sentinel for T3CK Core's Redis infrastructure. Sentinel provides automatic failover, monitoring, and cluster management.

**Status**: 🔧 To be implemented in production
**Environment**: GCP Cloud Run + Memorystore or self-hosted Redis
**Components**: 3 Sentinel instances + 1 Redis Master + 2 Redis Replicas

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      T3CK Core Services                       │
│            (Cloud Run instances, 3+ replicas)                │
└────┬────────────────────────────────────┬────────────────────┘
     │                                    │
     └────────────────────┬───────────────┘
                          │
                ┌─────────▼────────────┐
                │   Redis Sentinel     │
                │   Cluster (3x)       │ Monitors & Failovers
                └─────────┬────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
   ┌────▼────┐       ┌────▼────┐       ┌──▼─────┐
   │  Redis  │       │ Redis   │       │ Redis  │
   │ Master  │◄──────┤ Replica │       │Replica │
   │         │       │    1    │       │   2    │
   └─────────┘       └─────────┘       └────────┘
   (Primary)         (Standby)         (Standby)
   r-w                read-only         read-only
```

---

## 1. Architecture Decision: GCP Options

### Option 1: GCP Cloud Memorystore (Recommended for Production)

**Pros**:
- Managed Redis service
- Automatic backups
- Built-in HA (multi-zone replication)
- Google Cloud monitoring integration
- No Sentinel intervention needed (Google manages it)

**Cons**:
- Less control over Sentinel behavior
- Cannot customize Sentinel scripts
- Higher cost ($300+/month for 4GB instance)

**Recommended Setup**:
```bash
# Create Memorystore instance with HA enabled
gcloud redis instances create t3ck-redis \
  --size=4 \
  --region=us-central1 \
  --tier=standard \
  --replica-count=2 \
  --enable-auth \
  --transit-encryption-mode=SERVER_AUTHENTICATION
```

### Option 2: Self-Hosted Redis + Sentinel on Cloud Run or Compute Engine

**Pros**:
- Full control over Sentinel configuration
- Custom failover scripts
- Lower cost (if using small VMs)
- Can run alongside app services

**Cons**:
- Requires operational overhead
- Manual backup management
- Need to monitor Sentinel health
- Need to manage certificates/auth

**Recommended Setup**: 3 Sentinel instances on Cloud Run + Redis master/replicas on Compute Engine persistent disks.

### Option 3: Self-Hosted Redis + Sentinel on GKE

**Pros**:
- Kubernetes native health checks
- StatefulSets for persistence
- Easy scaling and updates
- Integration with GCP logging

**Cons**:
- Complex setup
- State management challenges
- Higher resource usage

---

## 2. Production Deployment: GCP Memorystore (Recommended)

### 2.1 Create High-Availability Redis Instance

```bash
# Set variables
PROJECT_ID="t3ck-core-prod"
REGION="us-central1"
INSTANCE_NAME="t3ck-redis-ha"
TIER_SIZE_GB=4  # 2GB for staging, 4GB for prod, 16GB for enterprise

# Create Memorystore instance with HA
gcloud redis instances create $INSTANCE_NAME \
  --project=$PROJECT_ID \
  --region=$REGION \
  --size=$TIER_SIZE_GB \
  --tier=standard \
  --replica-count=2 \
  --enable-auth \
  --redis-version=7.0 \
  --transit-encryption-mode=SERVER_AUTHENTICATION \
  --maintenance-window-day=SUN \
  --maintenance-window-hour=3 \
  --maintenance-window-duration=4h

# Get instance details
gcloud redis instances describe $INSTANCE_NAME \
  --project=$PROJECT_ID \
  --region=$REGION
```

### 2.2 Configure Cloud Run to Use Memorystore

```bash
# Get Redis endpoint
REDIS_HOST=$(gcloud redis instances describe $INSTANCE_NAME \
  --project=$PROJECT_ID \
  --region=$REGION \
  --format='value(host)')

REDIS_PORT=$(gcloud redis instances describe $INSTANCE_NAME \
  --project=$PROJECT_ID \
  --region=$REGION \
  --format='value(port)')

REDIS_AUTH_STRING=$(gcloud redis instances describe $INSTANCE_NAME \
  --project=$PROJECT_ID \
  --region=$REGION \
  --format='value(auth_string)')

# Update Cloud Run service environment
gcloud run services update api-gateway \
  --update-env-vars REDIS_HOST=$REDIS_HOST,REDIS_PORT=$REDIS_PORT,REDIS_AUTH=$REDIS_AUTH_STRING \
  --region=$REGION \
  --project=$PROJECT_ID
```

### 2.3 Setup VPC-SC (VPC Service Control) for Network Security

```bash
# This restricts Redis access to only authorized services
gcloud compute security-policies create t3ck-redis-policy \
  --project=$PROJECT_ID

# Add rules for Cloud Run services
gcloud compute security-policies rules create 100 \
  --security-policy=t3ck-redis-policy \
  --action=allow \
  --project=$PROJECT_ID
```

---

## 3. Self-Hosted Sentinel Setup (Alternative)

### 3.1 Deploy Sentinel on Cloud Run (if using self-hosted Redis)

```dockerfile
# Dockerfile for Sentinel
FROM redis:7-alpine

# Copy sentinel configuration
COPY sentinel.conf /etc/redis/sentinel.conf

# Expose Sentinel port
EXPOSE 26379

# Start Sentinel
CMD ["redis-sentinel", "/etc/redis/sentinel.conf"]
```

### 3.2 Deploy Three Sentinel Instances

```bash
#!/bin/bash

PROJECT_ID="t3ck-core-prod"
REGION="us-central1"

# Deploy 3 Sentinel instances
for i in 1 2 3; do
  SERVICE_NAME="redis-sentinel-$i"

  gcloud run deploy $SERVICE_NAME \
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
      SENTINEL_PORT=26379 \
    --project=$PROJECT_ID
done
```

### 3.3 Configure Sentinel Monitoring

Create monitoring script:

```bash
#!/bin/bash
# scripts/check-sentinel-health.sh

set -e

SENTINEL_HOSTS=("sentinel-1:26379" "sentinel-2:26379" "sentinel-3:26379")

echo "=== Checking Sentinel Cluster Health ==="

for host in "${SENTINEL_HOSTS[@]}"; do
  echo ""
  echo "Checking $host..."

  # Check if Sentinel is running
  if redis-cli -h "${host%:*}" -p "${host##*:}" PING; then
    echo "✅ Sentinel is up"

    # Get master info
    redis-cli -h "${host%:*}" -p "${host##*:}" SENTINEL masters

    # Check replicas
    redis-cli -h "${host%:*}" -p "${host##*:}" SENTINEL slaves t3ck-redis-master
  else
    echo "❌ Sentinel is down"
  fi
done

echo ""
echo "=== Sentinel Cluster Check Complete ==="
```

---

## 4. Monitoring and Alerting

### 4.1 Google Cloud Monitoring Integration

```yaml
# monitoring/redis-sentinel-alerts.yaml

apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: redis-sentinel-alerts
spec:
  groups:
    - name: redis.sentinel.rules
      interval: 30s
      rules:
        # Alert if master is down
        - alert: RedisMasterDown
          expr: redis_connected_slaves == 0
          for: 2m
          annotations:
            summary: "Redis master is down"
            severity: critical

        # Alert if replicas missing
        - alert: RedisReplicasDown
          expr: redis_connected_slaves < 2
          for: 5m
          annotations:
            summary: "Redis has fewer than 2 replicas"
            severity: warning

        # Alert on Sentinel memory usage
        - alert: SentinelHighMemory
          expr: process_resident_memory_bytes{job="redis-sentinel"} > 500000000
          for: 5m
          annotations:
            summary: "Sentinel memory usage is high"
            severity: warning

        # Alert on replication lag
        - alert: ReplicationLag
          expr: redis_slave_offset_bytes < redis_last_write_offset_bytes
          for: 10m
          annotations:
            summary: "Redis replication lag detected"
            severity: warning
```

### 4.2 Cloud Monitoring Dashboard

```bash
# Create custom dashboard
gcloud monitoring dashboards create --config-from-file=- <<'EOF'
{
  "displayName": "T3CK Redis Sentinel Status",
  "dashboardFilters": [],
  "gridLayout": {
    "widgets": [
      {
        "title": "Redis Master Status",
        "xyChart": {
          "dataSets": [
            {
              "timeSeriesQuery": {
                "timeSeriesFilter": {
                  "filter": "resource.type=\"redis_instance\" AND metric.type=\"redis.googleapis.com/clients/connected\""
                }
              }
            }
          ]
        }
      },
      {
        "title": "Replication Offset",
        "xyChart": {
          "dataSets": [
            {
              "timeSeriesQuery": {
                "timeSeriesFilter": {
                  "filter": "resource.type=\"redis_instance\" AND metric.type=\"redis.googleapis.com/replication/replica_offset_bytes\""
                }
              }
            }
          ]
        }
      },
      {
        "title": "Sentinel Health",
        "scorecard": {
          "timeSeriesQuery": {
            "timeSeriesFilter": {
              "filter": "resource.type=\"gce_instance\" AND metric.type=\"compute.googleapis.com/instance/cpu/utilization\" resource.labels.instance_id=~\"redis-sentinel.*\""
            }
          }
        }
      }
    ]
  }
}
EOF
```

---

## 5. Failover Procedures

### 5.1 Manual Failover Test

```bash
#!/bin/bash
# scripts/test-redis-failover.sh

set -e

PROJECT_ID="t3ck-core-prod"
REGION="us-central1"

echo "=== Starting Redis Failover Test ==="
echo "This will simulate a master failure and verify automatic failover"

# Step 1: Get current master
CURRENT_MASTER=$(gcloud redis instances describe t3ck-redis-ha \
  --region=$REGION \
  --project=$PROJECT_ID \
  --format='value(current_location)' | awk -F- '{print $(NF-1)"-"$(NF)}')

echo "Current master location: $CURRENT_MASTER"

# Step 2: Take a snapshot of connections
echo "Snapshots of connections before failover:"
redis-cli INFO replication

# Step 3: Initiate failover
echo ""
echo "Initiating manual failover..."
gcloud redis instances failover t3ck-redis-ha \
  --region=$REGION \
  --project=$PROJECT_ID

# Step 4: Wait for failover to complete
echo "Waiting 30 seconds for failover to complete..."
sleep 30

# Step 5: Verify new master
NEW_MASTER=$(gcloud redis instances describe t3ck-redis-ha \
  --region=$REGION \
  --project=$PROJECT_ID \
  --format='value(current_location)' | awk -F- '{print $(NF-1)"-"$(NF)}')

echo ""
echo "New master location: $NEW_MASTER"

if [ "$CURRENT_MASTER" != "$NEW_MASTER" ]; then
  echo "✅ Failover successful! Master changed from $CURRENT_MASTER to $NEW_MASTER"
else
  echo "⚠️  Master location unchanged - failover may not have completed"
fi

# Step 6: Verify data access
echo ""
echo "Testing data access post-failover..."
if redis-cli PING; then
  echo "✅ Redis is accessible"
else
  echo "❌ Redis is NOT accessible"
  exit 1
fi

echo ""
echo "=== Failover Test Complete ==="
```

### 5.2 Automatic Failover Trigger

Sentinel automatically triggers failover when:
- Master is down for `down-after-milliseconds` (default 30 seconds)
- At least `quorum` Sentinels agree master is unreachable
- At least one replica is available

---

## 6. Backup and Recovery

### 6.1 Create Redis Backup

```bash
# For GCP Memorystore
gcloud redis instances export t3ck-redis-ha \
  --output-data-format=rdb \
  --region=us-central1 \
  --project=$PROJECT_ID \
  --destination=gs://t3ck-backups/redis/$(date +%Y%m%d-%H%M%S).rdb

# For self-hosted Redis
redis-cli BGSAVE
# File is saved to /var/lib/redis/dump.rdb
```

### 6.2 Restore Redis from Backup

```bash
# For GCP Memorystore
gcloud redis instances import t3ck-redis-ha \
  --input-data-format=rdb \
  --region=us-central1 \
  --project=$PROJECT_ID \
  --source=gs://t3ck-backups/redis/backup-file.rdb

# For self-hosted Redis
redis-cli SHUTDOWN
cp /path/to/backup/dump.rdb /var/lib/redis/
redis-server
```

---

## 7. Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| Failover not triggering | Sentinel quorum not met | Ensure all 3 Sentinels are running |
| High replication lag | Network issues | Check VPC connectivity |
| Sentinel crashes | Memory exhausted | Increase Sentinel container memory |
| Stale data after failover | Master not properly synced | Enable AOF for better durability |
| Clients get wrong endpoint | DNS cache | Clear DNS cache, restart app |
| Out of memory errors | dataset too large | Increase Redis memory or eviction policy |

---

## 8. Environment Variables

Add these to your `.env` for Redis Sentinel:

```bash
# Redis Master Configuration
REDIS_HOST=<master-ip-or-hostname>
REDIS_PORT=6379
REDIS_PASSWORD=<redis-password>
REDIS_DB=0
REDIS_SSL=true

# Sentinel Configuration (if using self-hosted)
SENTINEL_HOST_1=sentinel-1:26379
SENTINEL_HOST_2=sentinel-2:26379
SENTINEL_HOST_3=sentinel-3:26379
SENTINEL_MASTER_NAME=t3ck-redis-master
SENTINEL_AUTH=<sentinel-password>

# Redis Client Settings
REDIS_MAX_RETRIES=3
REDIS_CONNECT_TIMEOUT=5000
REDIS_RETRY_STRATEGY=exponential
REDIS_POOL_SIZE=20
```

---

## 9. Monitoring Checklist

Daily checks:
- [ ] Sentinel cluster health: `redis-cli SENTINEL masters`
- [ ] Master connectivity: `redis-cli PING`
- [ ] Replica lag: `redis-cli INFO replication`
- [ ] Memory usage: `redis-cli INFO memory`

Weekly checks:
- [ ] Backup integrity test
- [ ] Failover simulation
- [ ] Log review for errors

Monthly checks:
- [ ] Full disaster recovery drill
- [ ] Performance analysis
- [ ] Update check for Redis/Sentinel

---

## 10. Next Steps

1. **Immediate**: Choose deployment option (GCP Memorystore recommended)
2. **Week 1**: Deploy HA Redis instance
3. **Week 2**: Update application to use Sentinel endpoints
4. **Week 3**: Run failover tests
5. **Week 4**: Update monitoring dashboards
6. **Ongoing**: Daily health checks and weekly tests

---

**Documentation Version**: 1.0
**Last Updated**: 2026-04-07
**Maintained By**: DevOps Team
