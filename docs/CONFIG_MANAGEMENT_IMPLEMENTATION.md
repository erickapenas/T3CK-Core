# Config Management Implementation with Google Secret Manager

## Overview

This document describes the configuration management implementation using Google Secret Manager and environment-based runtime configuration for the T3CK Core platform. This provides centralized, encrypted configuration management across all microservices running on Cloud Run.

**Status**: ✅ Complete and tested across all services
**Services**: auth-service, webhook-service, tenant-service
**Technology**: Google Secret Manager, Cloud Run environment variables, Cloud KMS

## Architecture

### Config Resolution Pattern

```
Application Request
    ↓
ConfigManager.getConfig(key)
    ├─ Check local cache (5 min TTL)
    ├─ Cache HIT: Return cached value
    └─ Cache MISS:
        ↓
    AWS Parameter Store Query
    ├─ Found: Cache + return
    └─ Not found:
        ↓
    Check Environment Variable
    ├─ Found: Return
    └─ Not found:
        ↓
    Return default value
```

### Parameter Hierarchy

```
Environment-Specific Path Structure:
/t3ck-core/                    # Base prefix
├─ development/               # Environment
│  ├─ redis-host
│  ├─ firebase-key
│  └─ rate-limit-max
├─ staging/
│  ├─ redis-host
│  ├─ firebase-key
│  └─ rate-limit-max
└─ production/
   ├─ redis-host
   ├─ firebase-key
   └─ rate-limit-max
```

## Installation

AWS SDK installed in each service:

```bash
# Install SDKs
pnpm add @aws-sdk/client-ssm @aws-sdk/client-secrets-manager
```

**Versions**:
- `@aws-sdk/client-ssm`: ^3.0.0+
- `@aws-sdk/client-secrets-manager`: ^3.0.0+

## Configuration

### Environment Variables

```bash
# AWS configuration
AWS_REGION=us-east-1                    # AWS region (default: us-east-1)
NODE_ENV=production                     # Environment (development/staging/production)

# Optional: Use IAM role (recommended for EC2/ECS)
# Or provide AWS credentials:
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
```

### Service Integration

Each service initializes ConfigManager:

```typescript
import { initializeConfig, getConfig } from './config';

// Initialize with options
initializeConfig({
  region: 'us-east-1',
  parameterPrefix: '/t3ck-core',
  environment: 'production',
});

// Use singleton instance
const config = getConfig();
const redisHost = await config.getConfig('redis-host', 'localhost');
```

## ConfigManager Class

### API Methods

```typescript
// Get string parameter
async getParameter(name: string, decrypt?: boolean): Promise<string | null>

// Get all parameters with prefix
async getParametersByPath(pathPrefix?: string): Promise<Record<string, string>>

// Get secret from Secrets Manager
async getSecret(secretName: string): Promise<Record<string, any> | null>

// Get config with environment variable fallback
async getConfig(key: string, defaultValue?: string, decrypt?: boolean): Promise<string>

// Get as boolean
async getConfigBoolean(key: string, defaultValue?: boolean): Promise<boolean>

// Get as number
async getConfigNumber(key: string, defaultValue?: number): Promise<number>

// Clear cache
clearCache(key?: string): void

// Close AWS clients
async close(): Promise<void>
```

## Usage Examples

### 1. Basic Configuration

```typescript
import { getConfig } from './config';

const config = getConfig();

// Get configuration
const redisHost = await config.getConfig('redis-host', 'localhost');
const redisPort = await config.getConfigNumber('redis-port', 6379);
const cacheEnabled = await config.getConfigBoolean('cache-enabled', true);
```

### 2. Parameter Store Hierarchy

**Create Parameters in AWS Console:**
```bash
aws ssm put-parameter \
  --name /t3ck-core/production/redis-host \
  --value "redis.example.com" \
  --type "String"

aws ssm put-parameter \
  --name /t3ck-core/production/api-rate-limit \
  --value "1000" \
  --type "String"

aws ssm put-parameter \
  --name /t3ck-core/production/database-password \
  --value "your-secure-password" \
  --type "SecureString" \
  --key-id "alias/aws/ssm"
```

**Use in Application:**
```typescript
const redisHost = await config.getConfig('redis-host');
const rateLimit = await config.getConfigNumber('api-rate-limit');
const dbPassword = await config.getConfig('database-password', undefined, true);
```

### 3. Secrets Manager Integration

**Create Secret:**
```bash
aws secretsmanager create-secret \
  --name t3ck-core/production/firebase \
  --secret-string '{
    "project_id": "...",
    "private_key": "...",
    "client_email": "..."
  }'
```

**Use in Application:**
```typescript
const firebaseSecret = await config.getSecret('t3ck-core/production/firebase');
const projectId = firebaseSecret?.project_id;
const privateKey = firebaseSecret?.private_key;
```

### 4. Environment-Based Configuration

```typescript
// In auth-service/src/index.ts
const env = process.env.NODE_ENV || 'development';

initializeConfig({
  parameterPrefix: '/t3ck-core',
  environment: env,  // Automatically adds to path
});

// Automatically uses:
// - /t3ck-core/development/... for dev
// - /t3ck-core/staging/... for staging
// - /t3ck-core/production/... for prod
```

### 5. Batch Configuration Loading

```typescript
const config = getConfig();

// Load all parameters for current environment
const allParams = await config.getParametersByPath();

// Use loaded config
console.log(allParams);
// {
//   'redis-host': 'redis.example.com',
//   'redis-port': '6379',
//   'api-key': '...',
//   ...
// }
```

### 6. Cache Management

```typescript
const config = getConfig();

// Get value (cached for 5 minutes)
const value1 = await config.getConfig('my-key');

// Clear specific key cache
config.clearCache('my-key');

// Clear all cache
config.clearCache();

// Get fresh value
const value2 = await config.getConfig('my-key');
```

### 7. Application Initialization

```typescript
import { getConfig } from './config';

async function initializeApp() {
  const config = getConfig();

  try {
    // Load all configuration
    const allParams = await config.getParametersByPath();

    // Initialize services with config
    const redisConfig = {
      host: allParams['redis-host'],
      port: parseInt(allParams['redis-port']),
      password: allParams['redis-password'],
    };

    const firebaseSecret = await config.getSecret('firebase-credentials');

    // Continue with initialized services
    return {
      redis: redisConfig,
      firebase: firebaseSecret,
    };
  } catch (error) {
    console.error('Failed to initialize configuration:', error);
    throw error;
  }
}
```

## AWS Setup

### Parameter Store Setup

```bash
# List parameters
aws ssm describe-parameters --filters "Key=Name,Values=/t3ck-core"

# Get single parameter
aws ssm get-parameter \
  --name /t3ck-core/production/redis-host \
  --with-decryption

# Put parameter (String)
aws ssm put-parameter \
  --name /t3ck-core/production/api-key \
  --value "your-api-key" \
  --type "String"

# Put parameter (SecureString - encrypted)
aws ssm put-parameter \
  --name /t3ck-core/production/db-password \
  --value "secure-password" \
  --type "SecureString"

# Update parameter
aws ssm put-parameter \
  --name /t3ck-core/production/api-key \
  --value "new-api-key" \
  --overwrite

# Delete parameter
aws ssm delete-parameter \
  --name /t3ck-core/production/old-key
```

### IAM Policy

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ssm:GetParameter",
        "ssm:GetParameters",
        "ssm:GetParametersByPath"
      ],
      "Resource": "arn:aws:ssm:*:ACCOUNT_ID:parameter/t3ck-core/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue"
      ],
      "Resource": "arn:aws:secretsmanager:*:ACCOUNT_ID:secret:t3ck-core/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "kms:Decrypt"
      ],
      "Resource": "arn:aws:kms:*:ACCOUNT_ID:key/*",
      "Condition": {
        "StringEquals": {
          "kms:ViaService": "ssm.*.amazonaws.com"
        }
      }
    }
  ]
}
```

## Deployment

### Local Development

```bash
# Use environment variables
export AWS_REGION=us-east-1
export NODE_ENV=development
export REDIS_HOST=localhost

# Or use AWS credentials for local Parameter Store access
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...

npm start
```

### Docker

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY . .
RUN pnpm install && pnpm build

ENV AWS_REGION=us-east-1
ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
```

### ECS Task Definition

```json
{
  "family": "t3ck-auth-service",
  "taskRoleArn": "arn:aws:iam::ACCOUNT:role/ecsTaskRole",
  "executionRoleArn": "arn:aws:iam::ACCOUNT:role/ecsTaskExecutionRole",
  "containerDefinitions": [
    {
      "name": "auth-service",
      "image": "ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/t3ck-auth:latest",
      "portMappings": [{"containerPort": 3001}],
      "environment": [
        {"name": "AWS_REGION", "value": "us-east-1"},
        {"name": "NODE_ENV", "value": "production"}
      ]
    }
  ]
}
```

### Kubernetes

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: t3ck-config
data:
  AWS_REGION: "us-east-1"
  NODE_ENV: "production"

---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: t3ck-services

---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: t3ck-ssm-access
rules:
- apiGroups: [""]
  resources: ["secrets"]
  verbs: ["get"]

---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: auth-service
spec:
  replicas: 2
  template:
    spec:
      serviceAccountName: t3ck-services
      containers:
      - name: auth-service
        image: auth-service:latest
        envFrom:
        - configMapRef:
            name: t3ck-config
        env:
        - name: AWS_ROLE_ARN
          valueFrom:
            fieldRef:
              fieldPath: metadata.annotations['iam.amazonaws.com/role']
```

## Performance & Optimization

### Caching Strategy

```
Local Cache TTL: 5 minutes
├─ Reduces API calls to Parameter Store
├─ Balances freshness vs performance
└─ Cleared automatically on expiry

For frequently accessed parameters:
├─ Use cache-enabled by default
├─ Clear cache only when updated
└─ Monitor cache hit rate
```

### Batch Loading

```typescript
// ❌ NOT OPTIMAL: Individual calls
const host = await config.getConfig('redis-host');
const port = await config.getConfig('redis-port');
const password = await config.getConfig('redis-password');

// ✅ OPTIMAL: Batch load
const allParams = await config.getParametersByPath();
const host = allParams['redis-host'];
const port = allParams['redis-port'];
const password = allParams['redis-password'];
```

### SecureString Optimization

```typescript
// Get encrypted parameter (default decryption enabled)
const dbPassword = await config.getParameter('db-password', true);

// Only decrypt when needed
const normalValue = await config.getParameter('normal-value', false);
```

## Best Practices

✅ **DO**:
- Use environment variables for optional config
- Store secrets in Secrets Manager (not Parameter Store)
- Use SecureString for sensitive parameters
- Implement caching for frequently accessed config
- Load all config at startup, not on demand
- Use hierarchical paths for organization
- Version parameters for deployments
- Regularly rotate secrets and credentials

❌ **DON'T**:
- Store secrets in Parameter Store plaintext
- Make parameter calls on every request
- Use hardcoded values
- Store database passwords in code
- Bypass cache unnecessarily
- Mix production/development configs

## Troubleshooting

### Parameter Not Found

```typescript
// Always provide default
const value = await config.getConfig('missing-key', 'default-value');

// Check Parameter Store path
aws ssm describe-parameters --filters "Key=Name,Values=/t3ck-core"

// Verify environment is correct
console.log(process.env.NODE_ENV);  // Should be production/staging/development
```

### Permission Denied

```bash
# Check IAM role/user has permissions
aws iam get-role --role-name ecsTaskRole

# Verify policy includes ssm and secretsmanager actions
aws iam get-role-policy --role-name ecsTaskRole --policy-name ssm-policy

# Test access
aws ssm get-parameter --name /t3ck-core/production/test
```

### Cache Staleness

```typescript
// Clear cache if config changes
const config = getConfig();
config.clearCache('redis-host');

// Or clear all cache
config.clearCache();

// Verify freshness
const value1 = await config.getConfig('my-key');
config.clearCache('my-key');
const value2 = await config.getConfig('my-key');
```

### High Latency

```typescript
// Use batch loading instead of individual calls
const allParams = await config.getParametersByPath();

// Check cache hit rate
// Monitor CloudWatch for API call metrics
aws cloudwatch get-metric-statistics \
  --namespace "AWS/Systems Manager" \
  --metric-name "ParameterCount" \
  --start-time 2025-02-01T00:00:00Z \
  --end-time 2025-02-02T00:00:00Z \
  --period 3600 \
  --statistics Sum
```

## Monitoring

### CloudWatch Metrics

```
AWS Systems Manager Parameter Store:
├─ ParameterCount: Total parameters
├─ GetParameterCount: API calls
└─ UpdateParameterCount: Update frequency

Secrets Manager:
├─ SecretCount: Total secrets
├─ GetSecretValueCount: API calls
└─ RotationAttempts: Secret rotations
```

### Application Metrics

```promql
# Configuration load time
config_load_duration_seconds

# Cache hit rate
config_cache_hit_rate

# Parameter access frequency
config_parameter_accesses_total
```

## References

- [AWS Parameter Store Documentation](https://docs.aws.amazon.com/systems-manager/latest/userguide/systems-manager-parameter-store.html)
- [AWS Secrets Manager Documentation](https://docs.aws.amazon.com/secretsmanager/)
- [AWS SDK for JavaScript v3](https://docs.aws.amazon.com/sdk-for-javascript/v3/)
- [IAM Best Practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html)

## Maintenance

**Daily**:
- Monitor parameter access logs
- Check for failed retrievals
- Verify cache is functioning

**Weekly**:
- Review parameter usage
- Update stale configurations
- Check access logs for unauthorized attempts

**Monthly**:
- Rotate secrets and credentials
- Review parameter hierarchy
- Audit access policies
- Plan parameter cleanup

---

**Last Updated**: Semana 2, Dia 5 (Feb 2025)
**Implementation Status**: ✅ Complete
**Services**: 3/3 (auth-service, webhook-service, tenant-service)
**Config Resolution**: Parameter Store → Environment Variable → Default
**Next Step**: Implement Service Discovery with AWS Cloud Map
