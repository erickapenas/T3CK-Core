# Tenant Offboarding & Data Management Guide

## Overview

This document covers tenant offboarding workflows, data export, compliance, and secure deletion procedures.

## 1. Tenant Offboarding Process

### Workflow Overview

```
Initiate Offboarding
    ↓
Verify Tenant Status
    ↓
Export Data (optional)
    ↓
Revoke All Access Tokens
    ↓
Schedule/Execute Data Deletion
    ↓
Complete Offboarding
```

### States During Offboarding

- **active** - Tenant operational, all services enabled
- **offboarding** - Offboarding in progress, API access restricted
- **offboarded** - Offboarding complete, tenant data deleted
- **suspended** - Temporary hold (fraud investigation, non-payment)

### Offboarding Endpoints

#### Initiate Offboarding

```
POST /tenant-service/offboarding/initiate
Content-Type: application/json
Authorization: Bearer <admin-token>

{
  "tenantId": "tenant_abc123",
  "reason": "request",  // request | contract_end | fraud | inactivity | other
  "exportData": true,   // Export tenant data before deletion
  "deleteImmediately": false,  // Delete immediately or after retention period
  "approvedBy": "admin_user_id"
}

Response:
{
  "success": true,
  "message": "Offboarding initiated for tenant: tenant_abc123",
  "offboardingStatus": "in_progress"
}
```

#### Export Tenant Data

```
POST /tenant-service/offboarding/export
Content-Type: application/json
Authorization: Bearer <admin-token>

{
  "tenantId": "tenant_abc123",
  "format": "json"  // json | csv
}

Response:
{
  "success": true,
  "export": {
    "tenantId": "tenant_abc123",
    "exportedAt": "2024-01-15T10:30:00Z",
    "s3Url": "s3://t3ck-backups/tenant-exports/tenant_abc123/1705318200000.json",
    "format": "json",
    "dataTypes": ["users", "orders", "payments", "webhooks", "events", "audit_logs"],
    "recordCount": 1243,
    "sizeBytes": 2847302
  }
}
```

#### Revoke Access Tokens

```
POST /tenant-service/offboarding/revoke-access
Content-Type: application/json
Authorization: Bearer <admin-token>

{
  "tenantId": "tenant_abc123"
}

Response:
{
  "success": true,
  "message": "Access tokens revoked for tenant: tenant_abc123"
}
```

#### Delete Tenant Data

```
POST /tenant-service/offboarding/delete
Content-Type: application/json
Authorization: Bearer <admin-token>

{
  "tenantId": "tenant_abc123",
  "confirm": true  // Safety flag - must be explicitly true
}

Response:
{
  "success": true,
  "message": "Tenant data deleted: tenant_abc123"
}
```

#### Get Offboarding Audit Trail

```
GET /tenant-service/offboarding/audit/:tenantId
Authorization: Bearer <admin-token>

Response:
{
  "tenantId": "tenant_abc123",
  "auditTrail": [
    {
      "timestamp": "2024-01-15T10:30:00Z",
      "action": "initiated",
      "details": {
        "reason": "request",
        "exportData": true,
        "approvedBy": "admin_user_id"
      },
      "executedBy": "tenant-service"
    },
    {
      "timestamp": "2024-01-15T10:30:45Z",
      "action": "data_exported",
      "details": {
        "s3Url": "s3://...",
        "recordCount": 1243
      },
      "executedBy": "tenant-service"
    },
    {
      "timestamp": "2024-01-15T10:31:20Z",
      "action": "data_deleted",
      "details": {
        "deletedAt": "2024-01-15T10:31:20Z",
        "tablesCleared": 8
      },
      "executedBy": "tenant-service"
    }
  ]
}
```

---

## 2. Data Export Process

### Supported Formats

#### JSON Export

```json
{
  "exportedAt": "2024-01-15T10:30:00Z",
  "tenantId": "tenant_abc123",
  "users": [
    {
      "id": "user_123",
      "email": "user@example.com",
      "name": "John Doe",
      "created_at": "2024-01-10T15:30:00Z"
    }
  ],
  "orders": [
    {
      "id": "order_456",
      "user_id": "user_123",
      "amount": 99.99,
      "status": "completed",
      "created_at": "2024-01-14T12:00:00Z"
    }
  ],
  "payments": [ ... ],
  "webhooks": [ ... ],
  "events": [ ... ],
  "audit_logs": [ ... ]
}
```

#### CSV Export

```
Multiple CSV files, one per data type:
- users.csv
- orders.csv
- payments.csv
- webhooks.csv
- events.csv
- audit_logs.csv
```

### Data Categories Included

- **Users** - All user accounts, profiles, roles
- **Orders** - Transaction history, order details
- **Payments** - Payment records, payment methods
- **Webhooks** - Webhook configurations, endpoints
- **Events** - Published events, event history
- **Audit Logs** - System audit trail, compliance records

### Export Security

- ✅ Encrypted in transit (HTTPS)
- ✅ Encrypted at rest (S3 SSE-KMS)
- ✅ Access restricted to admin users only
- ✅ Audit trail logged for compliance
- ✅ Long-term retention for archival (90+ days in S3)

---

## 3. Data Deletion & Retention

### Retention Policy

```
Data Classification  | Retention Period | Reason
--------------------------------------------------
Operational Data   | 30 days          | System operation, debugging
Personal Data      | GDPR compliant   | User privacy rights
Audit Logs         | 1 year           | Compliance, investigations
Backups            | 365 days         | Disaster recovery
```

### Deletion Workflow

**Immediate Delete:**

```
Tenant Data
  → Revoke Access (all tokens)
  → Delete Database Records
  → Delete S3 Artifacts
  → Clear Redis Cache
  → Mark as Deleted
```

**Scheduled Delete (30 days retention):**

```
Tenant Data
  → Mark for Deletion
  → Schedule Event (30 days from now)
  → Continue Limited Access (if needed)
  ↓ [30 days later]
  ↓
  → Execute Deletion Job
  → Remove All Records
  → Archive for Compliance
```

### Data Tables Affected

- `users` - All user accounts
- `orders` - Transaction history
- `payments` - Payment records
- `webhooks` - Webhook configs
- `events` - Event publications
- `api_keys` - API key records
- `sessions` - User sessions
- `activity_logs` - User activity
- `audit_logs` - System audit trail

### GDPR Compliance

#### Right to Access

```bash
# Export all tenant data
curl -X POST /tenant-service/offboarding/export \
  -d '{"tenantId": "tenant_abc", "format": "json"}'
```

#### Right to Erasure ("Right to be Forgotten")

```bash
# Schedule data deletion with retention period
curl -X POST /tenant-service/offboarding/delete \
  -d '{"tenantId": "tenant_abc", "confirm": true}'
```

#### Audit Trail for Compliance

```bash
# Get complete record of offboarding
curl /tenant-service/offboarding/audit/tenant_abc
```

---

## 4. Access Token Revocation

### Token Types Revoked

1. **JWT Access Tokens** - Immediate blacklist
2. **API Keys** - Marked as revoked
3. **Session Tokens** - Cleared from Redis
4. **Refresh Tokens** - Invalidated

### Implementation Details

```typescript
// Token Blacklist (Redis-backed)
await redis.set(`blacklist:jti:${jti}`, true, 'EX', ttl);

// API Key Revocation
await apiKeyStore.revoke(apiKeyId);

// Session Cleanup
await redis.del(`session:${userId}:*`);
await redis.del(`tenant:${tenantId}:sessions`);
```

### Verification

```bash
# Test access after revocation (should fail)
curl -H "Authorization: Bearer <revoked-token>" \
  https://api.example.com/api/data
# Response: 401 Unauthorized - Token Revoked
```

---

## 5. Offboarding Scenarios

### Scenario 1: Customer Requested Exit

```
Step 1: Export data for compliance
  ↓
Step 2: Notify external services
  ↓
Step 3: Revoke all access
  ↓
Step 4: Schedule deletion (30-day grace period)
  ↓
Step 5: Confirm with customer
  ↓
Step 6: Auto-delete after 30 days
```

### Scenario 2: Fraud Detected

```
Step 1: Immediate suspension
  ↓
Step 2: Suspend all API access
  ↓
Step 3: Export data for investigation
  ↓
Step 4: Revoke all sessions
  ↓
Step 5: Schedule immediate deletion
  ↓
Step 6: Notify compliance team
```

### Scenario 3: Inactivity (e.g., no usage for 180 days)

```
Step 1: Send warning email (60 days before)
  ↓
Step 2: Track tenant activity
  ↓
Step 3: Initiate offboarding if still inactive
  ↓
Step 4: Export and archive data
  ↓
Step 5: Schedule deletion (7-day notice period)
  ↓
Step 6: Delete after 7 days
```

---

## 6. Monitoring & Alerts

### CloudWatch Metrics

```
- TenantOffboarding.Initiated (count)
- TenantOffboarding.Completed (count)
- TenantOffboarding.Failed (count)
- DataExport.RecordCount (histogram)
- DataExport.SizeBytes (histogram)
- TokenRevocation.TokensRevoked (count)
```

### Alarm Configuration

```
Alert if:
- Offboarding fails: severity=HIGH
- Deletion job fails: severity=CRITICAL
- Export takes >5 minutes: severity=MEDIUM
- Audit trail corrupted: severity=CRITICAL
```

---

## 7. Disaster Recovery

### Backup Before Deletion

```
All tenant data is:
1. Exported to S3 (encrypted with KMS)
2. Archived for 90 days minimum
3. Accessible via audit trail
4. Recoverable if deletion was error
```

### Restore from Backup

```bash
# If deletion was unintended
1. Download export from S3
2. Verify tenant ID and date
3. Restore to database
4. Re-enable authentication
5. Notify customer
```

---

## 8. Service-to-Service Integration

### Authentication Service Notification

```
POST http://auth-service:3001/auth/tokens/revoke-all
{
  "tenantId": "tenant_abc123"
}
```

### Webhook Service Notification

```
POST http://webhook-service:3002/webhooks/internal-events
{
  "tenantId": "tenant_abc123",
  "event": "tenant.offboarded",
  "timestamp": "2024-01-15T10:31:20Z"
}
```

### Event Bus Publishing

```
Topic: tenant-offboarding-events
Events:
  - tenant.offboarding.initiated
  - tenant.offboarding.data_exported
  - tenant.offboarding.access_revoked
  - tenant.offboarding.completed
```

---

## 9. Security Considerations

### Access Control

- ✅ Admin-only endpoints
- ✅ Approval audit trail required
- ✅ Service-to-service auth via mutual TLS

### Data Protection

- ✅ Encryption in transit (TLS 1.2+)
- ✅ Encryption at rest (KMS)
- ✅ Public access blocked
- ✅ Access logging enabled

### Audit Trail

- ✅ All offboarding operations logged
- ✅ Immutable audit records
- ✅ Timeline of all actions
- ✅ Person/service responsible recorded
