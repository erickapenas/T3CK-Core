# E2E Test Configuration

## Environment Variables

Create `.env.staging` and `.env.production` files in this directory, or copy from the `.example` files:

```bash
# .env.staging
ENVIRONMENT=staging
BASE_URL=http://localhost:3000
TEST_EMAIL=test@example.com
TEST_PASSWORD=password123
TEST_TIMEOUT=10000
TEST_RETRIES=3

# .env.production
ENVIRONMENT=production
PROD_URL=https://api.t3ck.io
TEST_EMAIL=test@example.com
TEST_PASSWORD=password123
TEST_TIMEOUT=15000
TEST_RETRIES=3
```

## Running Tests

```bash
# Staging (default)
pnpm test:staging

# Production
pnpm test:production

# Watch mode
pnpm test:watch

# Coverage report
pnpm test:coverage
```

## Test Categories

1. **Health Endpoints** - Verifies service availability and latency
2. **Authentication Flow** - Tests login and token validation
3. **Webhook Connectivity** - Validates webhook event processing
4. **Service Stability** - Ensures consistent service health over time

## GitHub Actions Integration

The E2E tests run automatically:

- After staging deployment (develop → staging)
- Before production deployment (main → production)
