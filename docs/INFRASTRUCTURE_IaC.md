# Infrastructure as Code (IaC) Implementation Guide

## Overview
This document covers the infrastructure components recommended for T3CK production deployment on Google Cloud Platform, including Terraform state management, Cloud Armor protection, Cloud Run scaling, HTTPS entry, secrets, and managed data services.

## 1. Terraform Remote Backend

### Purpose
Secure, centralized state management with locking and versioning to prevent concurrent modifications and simplify recovery.

### Components
- **GCS Bucket** (`t3ck-terraform-state-{environment}`)
  - Versioning enabled for rollback capability
  - Encryption with Google-managed keys or Cloud KMS
  - Public access prevented via IAM
  - Access logging/audit via Cloud Logging and Cloud Audit Logs

### Backend Configuration

Add to your root `main.tf`:

```hcl
terraform {
  backend "gcs" {
    bucket = "t3ck-terraform-state"
    prefix = "terraform/state"
  }
}
```

### Migration Steps

1. **Initialize local state** (if first time):
   ```bash
   terraform init
   ```

2. **Create backend bucket**:
   ```bash
   gsutil mb -l us-central1 gs://t3ck-terraform-state
   gsutil versioning set on gs://t3ck-terraform-state
   ```

3. **Migrate to remote state**:
   ```bash
   terraform init -reconfigure \
     -backend-config="bucket=t3ck-terraform-state" \
     -backend-config="prefix=terraform/state"

   terraform state list
   ```

### Security Best Practices
- ✅ Encryption at rest
- ✅ TLS enforcement
- ✅ Public access blocked
- ✅ Versioning enabled
- ✅ Audit logging enabled

---

## 2. Cloud Armor (Web Application Firewall)

### Purpose
Protect Cloud Run entrypoints and load balancers against common web attacks, rate limiting abuse, and geo/IP restrictions.

### Rules Included

1. **Managed Protection**
   - OWASP-style protections
   - Known bad input filtering
   - IP reputation and threat controls where applicable

2. **Rate Limiting**
   - Default: 2000 requests per 5-minute period per IP
   - Scope: `/api/*` endpoints
   - Threshold adjustable by environment

3. **Geographic Blocking**
   - Optional deny rules by country code

4. **IP Allow/Deny Lists**
   - Manual CIDR controls for incident response

### Monitoring
- Rule matches sent to Cloud Logging
- 30-day baseline retention or policy-defined retention
- Inspection via Cloud Monitoring dashboards and alert policies

### Validation
```bash
# Simulate SQL injection pattern
curl -X GET "https://api.example.com/api/users?id=1' OR '1'='1"

# Rate limit test
for i in {1..3000}; do
  curl https://api.example.com/api/data &
done
wait
```

---

## 3. Cloud Run Scaling

### Purpose
Automatically scale service revisions based on concurrent traffic and request volume without managing clusters.

### Scaling Controls

1. **Minimum instances**
   - Keep warm capacity for critical services

2. **Maximum instances**
   - Prevent runaway cost under load

3. **Concurrency settings**
   - Tune request parallelism per service

4. **CPU and memory sizing**
   - Set per service based on workload characteristics

### Capacity Guidance
```
Production defaults:
  - min instances: 1-2 for critical services
  - max instances: 10-20 depending on service

Latency-sensitive services:
  - lower concurrency
  - higher minimum instances
```

### Monitoring
```bash
# View Cloud Run services
 gcloud run services list --region us-central1

# Describe one service
 gcloud run services describe t3ck-api-gateway --region us-central1
```

---

## 4. HTTPS Entry, Routing and Managed Services

### Purpose
Distribute traffic securely to Cloud Run services and connect the application to managed backing services.

### Components
- **Cloud Run** for HTTP services
- **HTTPS Load Balancing** for public entry when custom domains or advanced routing are required
- **Artifact Registry** for Docker images
- **Cloud SQL for MySQL** for relational persistence
- **Memorystore for Redis** for cache, queues and distributed rate limiting
- **Secret Manager** for runtime secrets
- **Cloud KMS** for managed encryption keys

### Routing Model
1. Health checks (`/health*`)
2. API endpoints (`/api/*`)
3. Service-specific routes by gateway configuration
4. Optional gRPC/WebSocket support as validated by service behavior

### Logging and Access
- Access and application logs go to Cloud Logging
- Secrets stay in Secret Manager and should not be hardcoded in IaC
- Custom domains use Google-managed certificates or Certificate Manager

### Deployment Integration

Primary deployment path:
- build images with Cloud Build
- store images in Artifact Registry
- deploy revisions to Cloud Run
- inject runtime configuration via env vars and Secret Manager

---

## Deployment Checklist

- [ ] GCS Terraform backend created and tested
- [ ] Terraform state migrated to remote backend
- [ ] Cloud Armor rules validated
- [ ] Cloud Run scaling reviewed and tuned
- [ ] Health check endpoints returning 200
- [ ] HTTPS/custom domain configured if required
- [ ] Logs visible in Cloud Logging
- [ ] Alerting policies created in Cloud Monitoring
- [ ] Load test performed to validate scaling
- [ ] Cloud SQL and Memorystore connectivity validated

---

## Troubleshooting

### Terraform Backend Issues
```bash
gsutil ls gs://t3ck-terraform-state
terraform force-unlock <LOCK_ID>
```

### Cloud Armor Blocking Legitimate Traffic
- Review request logs in Cloud Logging
- Inspect security policy rules
- Add exceptions or tune thresholds

### Cloud Run Not Scaling as Expected
- Review min/max instances and concurrency
- Check Cloud Monitoring metrics
- Inspect cold start and latency patterns

### Service Returning 5xx
- Inspect Cloud Run revision logs
- Validate Secret Manager and database connectivity
- Verify Cloud SQL / Memorystore networking and service configuration

