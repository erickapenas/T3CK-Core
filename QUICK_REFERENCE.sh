#!/usr/bin/env bash
# T3CK Core - Quick Reference Guide
# Run: bash QUICK_REFERENCE.sh or source QUICK_REFERENCE.sh

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║              🚀 T3CK CORE - QUICK REFERENCE GUIDE              ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}📦 SETUP${NC}"
echo "  pnpm install              # Install dependencies"
echo "  pnpm setup                # Full project setup"
echo ""

echo -e "${CYAN}🏗️  BUILD${NC}"
echo "  pnpm build                # Build all services"
echo "  pnpm type-check           # TypeScript validation"
echo "  pnpm lint                 # ESLint check"
echo "  pnpm format:check         # Prettier check"
echo ""

echo -e "${CYAN}✅ TEST${NC}"
echo "  pnpm test                 # Unit tests"
echo "  pnpm test:watch           # Unit tests (watch)"
echo "  pnpm test:coverage        # Coverage report"
echo "  pnpm test:e2e:staging     # E2E tests (staging)"
echo "  pnpm test:e2e:production  # E2E tests (production)"
echo ""

echo -e "${CYAN}🎯 SMOKE TESTS${NC}"
echo "  bash scripts/smoke-tests.sh                    # Linux/macOS"
echo "  ./scripts/smoke-tests.ps1                      # Windows"
echo "  PROD_URL=https://api.t3ck.io bash scripts/smoke-tests.sh"
echo ""

echo -e "${CYAN}⚙️  DEPLOYMENT${NC}"
echo "  git push origin develop        # Deploy to staging"
echo "  git push origin main           # Deploy to production (needs approval)"
echo ""

echo -e "${CYAN}🔄 ROLLBACK${NC}"
echo "  ./scripts/rollback-production.sh auth-service      # Rollback service"
echo "  ./scripts/rollback-production.sh all               # Rollback all"
echo ""

echo -e "${CYAN}👀 MONITORING${NC}"
echo "  aws logs tail /aws/ecs/t3ck-cluster --follow       # ECS logs"
echo "  aws ecs describe-services --cluster t3ck-cluster   # Service status"
echo "  GitHub.com → Actions                              # CI/CD status"
echo ""

echo -e "${CYAN}📖 DOCUMENTATION${NC}"
echo "  docs/DEPLOYMENT.md         # Deployment guide"
echo "  docs/TESTING.md            # Testing guide"
echo "  .github/SECRETS.md         # Secrets configuration"
echo "  IMPLEMENTATION_COMPLETE.md # Implementation status"
echo "  E2E_IMPLEMENTATION.md      # E2E tests details"
echo ""

echo -e "${CYAN}🔑 GITHUB SECRETS${NC}"
echo "  AWS_ACCESS_KEY_ID          # AWS credentials"
echo "  AWS_SECRET_ACCESS_KEY      # AWS credentials"
echo "  STAGING_URL                # Staging environment URL"
echo "  PROD_URL                   # Production environment URL"
echo "  SLACK_WEBHOOK              # Slack notifications (optional)"
echo ""

echo -e "${CYAN}🌳 WORKFLOW${NC}"
echo "  1. Create feature branch: git checkout -b feature/my-feature"
echo "  2. Make changes and commit: git commit -am 'message'"
echo "  3. Push to origin: git push origin feature/my-feature"
echo "  4. Create PR on GitHub"
echo "  5. Wait for CI/CD (lint, type-check, tests, build)"
echo "  6. Get code review approval"
echo "  7. Merge to main (via GitHub)"
echo "  8. Production deployment starts automatically"
echo "  9. Approve in CI/CD if required"
echo "  10. Monitor logs and metrics"
echo ""

echo -e "${CYAN}📊 PROJECT STRUCTURE${NC}"
echo "  e2e/                  # E2E tests (NEW)"
echo "  packages/"
echo "    sdk/               # T3CK SDK"
echo "    shared/            # Shared utilities"
echo "  services/"
echo "    auth-service/      # Authentication"
echo "    tenant-service/    # Provisioning"
echo "    webhook-service/   # Webhooks"
echo "  infrastructure/"
echo "    cdk/               # AWS CDK (State Machine)"
echo "    lambda/            # Lambda handlers"
echo "    terraform/         # Terraform configs"
echo "  scripts/"
echo "    smoke-tests.sh     # Smoke tests (Bash)"
echo "    smoke-tests.ps1    # Smoke tests (PowerShell)"
echo "    rollback-*.sh      # Rollback automation"
echo "  docs/                # Documentation"
echo ""

echo -e "${GREEN}✨ Quick Reference Complete!${NC}"
echo ""
echo "For more info, see:"
echo "  - IMPLEMENTATION_COMPLETE.md"
echo "  - docs/DEPLOYMENT.md"
echo "  - docs/TESTING.md"
echo ""
