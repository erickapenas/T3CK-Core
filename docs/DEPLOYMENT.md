# 🚀 T3CK Production Deployment Guide

## Visão Geral

O pipeline de CI/CD do T3CK implementa um processo robusto, seguro e rastreável para deployment em produção, com blue-green deployment, smoke tests automáticos e rollback inteligente.

## 📊 Fluxo Simplificado

```
develop branch → STAGING (automático) → E2E tests → ✅
main branch → APPROVAL GATE → PRODUCTION (blue-green) → SMOKE TESTS → ROLLBACK (if fail)
```

## 🔄 Branches

| Branch | Destino | Deploy | Approval | Testes |
|--------|---------|--------|----------|--------|
| `develop` | Staging | Automático | Não | E2E |
| `main` | Production | Manual | Sim | Smoke + Health |

## ✨ Recursos Implementados

### 1. Quality Gates (Before Deploy)
- ✅ ESLint (code style)
- ✅ Prettier (formatting)
- ✅ TypeScript (type safety)
- ✅ Jest (unit tests, 80% coverage)
- ✅ Snyk (security scanning)

### 2. Blue-Green Deployment
- Two versions running in parallel
- Zero downtime switching
- Instant rollback capability

### 3. Smoke Tests (Automatic)
- Health endpoints check
- Authentication flow validation
- Webhook service connectivity
- Service stability verification

### 4. Automatic Rollback
- Detects failures
- Reverts to previous version
- Stabilizes services
- Notifies via Slack

### 5. Manual Approval for Production
- Required code reviews (1+ approvals)
- Manual approval in GitHub Actions
- Full audit trail

### 6. Slack Notifications
- Deployment started
- Deployment succeeded
- Deployment failed
- Automatic rollback triggered

## 📝 Quick Setup

### 1. Configure Secrets (see `.github/SECRETS.md`)
```
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
STAGING_URL (environment: staging)
PROD_URL (environment: production)
SLACK_WEBHOOK (optional)
```

### 2. Configure GitHub Environments
- `Settings → Environments → staging` (auto-deploy)
- `Settings → Environments → production` (manual approval)

### 3. Verify IAM Permissions
- ECR: push/pull
- ECS: describe/update
- CloudWatch: logs access

See `.github/SECRETS.md` for complete IAM policy

## 🔧 Operations

### Deploy Process
1. ✅ Lint & Format check passes
2. ✅ Type check passes
3. ✅ Unit tests pass
4. ✅ Build succeeds
5. 🎯 Deploy to staging (develop) OR wait approval (main)
6. ✅ E2E tests pass (staging)
7. ✅ Smoke tests pass (production)
8. ✅ Health checks pass
9. ✨ Deployment complete!

### Manual Approval (Production Only)
```
GitHub.com → Repository → Actions → [Workflow Run]
→ Review Deployments → Approve and deploy
```

### Rollback Script

**Linux/macOS:**
```bash
./scripts/rollback-production.sh auth-service           # Rollback to previous
./scripts/rollback-production.sh auth-service abc123    # Rollback to commit
./scripts/rollback-production.sh all                    # Rollback all
```

**Windows:**
```powershell
.\scripts\rollback-production.ps1 -Service auth-service
.\scripts\rollback-production.ps1 -Service auth-service -CommitSha abc123
.\scripts\rollback-production.ps1 -Service all
```

### Check Status
```bash
# CloudWatch logs
aws logs tail /aws/ecs/t3ck-cluster --follow

# ECS service status
aws ecs describe-services --cluster t3ck-cluster --services auth-service

# GitHub Actions
GitHub.com → Actions → View workflow run
```

## 🐛 Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| "Services Not Stable" | Task failed to start | Check CloudWatch logs, rollback executed |
| "Smoke Tests Failed" | Service unresponsive | Check ALB health, security groups, rollback executed |
| "Invalid AWS Credentials" | Expired or wrong keys | Generate new AWS keys, update secrets |
| "ECR Image Not Found" | Docker build failed | Check build logs in GitHub Actions |

## 📊 Success Metrics

| Metric | Target | Notes |
|--------|--------|-------|
| Deployment Success | > 95% | Monitor rollback rate |
| Smoke Test Pass Rate | 100% | Auto-rollback if fail |
| Deploy Time (staging) | < 15m | Total pipeline time |
| Deploy Time (prod) | < 30m | Includes approval gate |
| MTTR (Mean Time to Recover) | < 5m | Auto-rollback helps |

## 🧱 Riscos de Infraestrutura (Sizing e Custos)

- **RDS Multi-AZ** e **ElastiCache** aumentam custos. Recomendação:
	- **Staging/Dev**: `db.t4g.micro` + `cache.t4g.micro`
	- **Produção**: `db.r6g.large` + `cache.r6g.large`
- Alternativa: **Aurora Serverless v2** com auto-scaling para picos.
- Revisar custos mensalmente via AWS Cost Explorer.

## 🐤 Estratégia de Rollout Canário

1. Criar 3 tenants canário em staging.
2. Validar critérios de sucesso:
	 - Uptime > 99.5%
	 - 5xx < 5/h
	 - Latência p95 < 500ms
3. Após 72h estáveis, liberar para demais tenants.
4. Em regressão, acionar rollback urgente.

## 📘 Runbooks de Operação

- [docs/runbooks/incident-response.md](docs/runbooks/incident-response.md)
- [docs/runbooks/database-failover.md](docs/runbooks/database-failover.md)
- [docs/runbooks/rollback-urgente.md](docs/runbooks/rollback-urgente.md)

## 🔐 Security Features

✅ Secrets encrypted at rest
✅ Manual approval for production
✅ Automatic rollback on failure
✅ Blue-green deployment (zero downtime)
✅ Health checks after deployment
✅ Audit trail of all deployments
✅ Credentials rotated every 90 days

## 📚 Full Documentation

- Secrets: `.github/SECRETS.md`
- Infrastructure: `/infrastructure/cdk/README.md`
- Terraform: `/infrastructure/terraform/README.md`
- GitHub Actions: `https://docs.github.com/en/actions`

---

**Last Updated:** January 2026 | **Status:** ✅ Production Ready
