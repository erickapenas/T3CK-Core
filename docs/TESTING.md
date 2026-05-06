# E2E & Smoke Testing Guide

## Overview

O T3CK implementa dois níveis de testes de validação:

1. **E2E Tests** - Testes completos de staging após deploy
2. **Smoke Tests** - Validação rápida de produção após deploy

## E2E Tests (Staging)

### O que testa

- ✅ Health Endpoints - Disponibilidade dos serviços
- ✅ Authentication Flow - Login e validação de tokens
- ✅ Webhook Connectivity - Processamento de eventos
- ✅ Service Stability - Consistência de saúde ao longo do tempo

### Rodando localmente

```bash
# Staging (default)
pnpm test:e2e:staging

# Production
pnpm test:e2e:production

# Watch mode
pnpm test:e2e:watch

# Coverage
pnpm test:e2e:coverage
```

### Configuração

```bash
# .env.staging
ENVIRONMENT=staging
BASE_URL=http://localhost:3000
TEST_EMAIL=test@example.com
TEST_PASSWORD=password123
```

### No CI/CD

```yaml
e2e-tests:
  runs-on: ubuntu-latest
  needs: [deploy-staging]
  if: github.ref == 'refs/heads/develop'
  steps:
    - Run E2E tests (pnpm test:e2e:staging)
    - Tests executam contra staging por 30-60 segundos
```

## Smoke Tests (Production)

### O que testa

1. Health Endpoints - Main health check
2. Auth Service - /auth/health
3. Webhook Service - /api/webhooks (OPTIONS)
4. Tenant Service - /provisioning/submit (OPTIONS)
5. Authentication Flow - POST /auth/login
6. Service Stability - 3 health checks over 30 segundos

### Rodando localmente

```bash
# Linux/macOS
bash scripts/smoke-tests.sh

# Windows PowerShell
.\scripts\smoke-tests.ps1

# Com URL customizada
PROD_URL=https://api.t3ck.io bash scripts/smoke-tests.sh
.\scripts\smoke-tests.ps1 -Url https://api.t3ck.io
```

### No CI/CD

```yaml
deploy-production:
  steps:
    - Deploy to ECS (Blue-Green)
    - Wait for services stable (10 min)
    - Run smoke tests (bash scripts/smoke-tests.sh)
    - Verify service stability
    - Rollback if failed
```

## Test Results Interpretation

### E2E Tests Output

```
✅ Health Endpoints
   Passed: 4/4 | Duration: 1243ms
  ✓ GET /health responds with 200 (145ms)
  ✓ Service auth-service is available (234ms)
  ✓ Service tenant-service is available (187ms)
  ✓ Service webhook-service is available (201ms)

✅ Authentication Flow
   Passed: 3/3 | Duration: 856ms
  ✓ Login with valid credentials returns token (412ms)
  ✓ Authenticated request with token succeeds (234ms)
  ✓ Login with invalid credentials returns error (210ms)

✅ Webhook Connectivity
   Passed: 3/3 | Duration: 645ms

✅ Service Stability
   Passed: 1/1 | Duration: 30234ms
  ✓ Service remains healthy across 3 checks (30s total)

════════════════════════════════════════════════════
Total: 11 | Passed: 11 | Failed: 0
════════════════════════════════════════════════════
```

### Smoke Tests Output

```
🧪 Starting production smoke tests...
Target: https://api.t3ck.io
Timeout: 10s

📋 Test 1: Health Endpoints... ✓ PASSED
📋 Test 2: Auth Service... ✓ PASSED
📋 Test 3: Webhook Service... ✓ PASSED
📋 Test 4: Tenant Service... ✓ PASSED
📋 Test 5: Authentication Flow... ✓ PASSED
📋 Test 6: Service Stability (3 checks)... ✓ PASSED

════════════════════════════════════════════════════
Total Tests: 6
Passed:      6
Failed:      0
════════════════════════════════════════════════════

✅ All smoke tests passed!
```

## Troubleshooting

### E2E Tests Fail with "Service unhealthy"

```
Problem: Health check returned error
Solutions:
1. Check STAGING_URL is correct: pnpm test:e2e:staging
2. Wait for services to stabilize (2-5 min after deploy)
3. Check CloudWatch logs: aws logs tail /aws/ecs/t3ck-cluster --follow
4. Rollback staging if needed: ./scripts/rollback-production.sh webhook-service
```

### E2E Tests Timeout

```
Problem: Tests taking too long
Solutions:
1. Increase timeout: TEST_TIMEOUT=30000 pnpm test:e2e:staging
2. Check network connectivity
3. Look for stuck operations in CloudWatch
```

### Smoke Tests Fail with "FAILED"

```
Problem: Production endpoint not responding
Solutions:
1. Check PROD_URL is correct: echo $PROD_URL
2. Verify AWS credentials: aws sts get-caller-identity
3. Check ECS service status: aws ecs describe-services --cluster t3ck-cluster --services auth-service
4. Automatic rollback will trigger - check rollback logs
5. Manual rollback: ./scripts/rollback-production.sh all
```

### "Invalid credentials" in smoke tests

```
Problem: Test user doesn't exist in production
Solutions:
1. Create test user in production Firebase
2. Update TEST_EMAIL and TEST_PASSWORD in GitHub Secrets
3. Or skip auth testing in production smoke tests (optional gate)
```

## Best Practices

### For Developers

- 🔄 Always run E2E locally before pushing to develop
- 📊 Monitor E2E results in CI/CD Actions tab
- 🧪 Add new test cases to smoke-test.ts when adding features
- 🔍 Check CloudWatch logs if tests fail

### For Deployments

- ⏱️ E2E tests run immediately after staging deploy
- 🟢 Wait for all tests to pass (green checks)
- 🟠 If any test fails, staging rollback happens automatically
- 🔴 Never proceed to production if E2E fails
- 📱 Smoke tests run automatically after production deploy
- ⚠️ Automatic rollback if any smoke test fails

### For Production Incidents

```bash
# Quick health check
curl -s https://api.t3ck.io/health | jq .

# Manual smoke tests
bash scripts/smoke-tests.sh

# Force rollback to previous
./scripts/rollback-production.sh all

# Check deployment history
git log --oneline -20 main

# View recent errors
aws logs tail /aws/ecs/t3ck-cluster --follow
```

## Test Coverage Goals

| Category          | Coverage | Priority |
| ----------------- | -------- | -------- |
| Health Endpoints  | 100%     | Critical |
| Authentication    | 95%      | Critical |
| Webhook Events    | 90%      | High     |
| Service Stability | 100%     | Critical |
| Error Handling    | 80%      | Medium   |

## Integration with CI/CD

```
develop branch:
  build → unit-tests → lint → deploy-staging → e2e-tests ✓ → ready for prod

main branch:
  build → unit-tests → lint → approval-gate → deploy-prod → smoke-tests ✓ → monitoring
```

---

**Last Updated:** January 2026 | **Status:** ✅ Production Ready
