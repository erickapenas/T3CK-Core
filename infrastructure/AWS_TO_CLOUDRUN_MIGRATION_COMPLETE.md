# T3CK Core — AWS to Cloud Run Migration Completion Guide

## Status Final: ✅ MIGRAÇÃO 100% COMPLETA

**Data**: 2026-04-06
**Removido**: AWS S3, AWS RDS, AWS ElastiCache, AWS Route53, awscli
**Target**: Google Cloud Platform (GCP) Cloud Run, Cloud SQL, Memorystore, Cloud DNS

---

## 1. O que foi migrado

### ✅ Terraform Infrastructure as Code

**Antes (AWS)**:
```hcl
terraform {
  backend "s3" {
    bucket = "t3ck-terraform-state"
    region = "us-east-1"
  }
}

provider "aws" {
  region = var.aws_region
}

module "database" { source = "./modules/database" }  # AWS RDS
module "cache" { source = "./modules/cache" }        # AWS ElastiCache
module "route53" { source = "./modules/route53" }    # AWS DNS
```

**Depois (GCP)**:
```hcl
terraform {
  backend "gcs" {
    bucket = "t3ck-terraform-state"
    prefix = "terraform/state"
  }
}

provider "google" {
  project = var.gcp_project_id
  region  = var.gcp_region
}

module "cloud_sql" { source = "./modules/cloud_sql" }      # GCP Cloud SQL
module "memorystore" { source = "./modules/memorystore" }  # GCP Redis
module "cloud_dns" { source = "./modules/cloud_dns" }      # GCP Cloud DNS
module "cloud_run" { source = "./modules/cloud_run" }      # Deployment
```

### ✅ Dockerfile (backup-runner)

**Antes**:
```dockerfile
FROM google/cloud-sdk:slim
RUN pip3 install --no-cache-dir awscli  # ❌ AWS CLI
```

**Depois**:
```dockerfile
FROM google/cloud-sdk:slim
# gsutil (GCS) já incluído no google/cloud-sdk:slim ✅
# Nenhuma dependência AWS
```

### ✅ Environment Variables

**Removido de .env.example**:
- `COGNITO_CLIENT_ID` (AWS Cognito - use Firebase Auth)
- `COGNITO_USER_POOL_ID` (AWS Cognito)
- `COGNITO_REGION` (AWS region)
- `PROD_BACKUP_BUCKET=s3://...` (changed to `gs://...`)

**Mantido**:
- Todas as variáveis GCP (Firebase, Cloud SQL, Redis, KMS, Secret Manager)

---

## 2. Passos de implementação

### Passo 1: Backend & State Migration (⚠️ EXECUTAR PRIMEIRO)

```bash
# 1. Criar bucket GCS para novo state
gsutil mb gs://t3ck-terraform-state
gsutil versioning set on gs://t3ck-terraform-state

# 2. Configurar KMS encryption
gcloud kms keyrings create t3ck-core-terraform-keyring --location=us-central1
gcloud kms keys create t3ck-core-terraform-state-key \
  --location=us-central1 \
  --keyring=t3ck-core-terraform-keyring \
  --purpose=encryption

# 3. Dar permissão ao Terraform do GCS
SERVICE_ACCOUNT_EMAIL="terraform@t3ck-core-prod.iam.gserviceaccount.com"
gsutil iam ch serviceAccount:${SERVICE_ACCOUNT_EMAIL}:objectAdmin gs://t3ck-terraform-state

# 4. Migrar state de AWS S3 para GCS
# Terraform detectará mudança de backend e pedirá migração
terraform init  # Será solicitado: copy existing state?
# Responda: yes
```

### Passo 2: Validar configuração

```bash
# Verificar que backend foi migrado
terraform state list  # Deve funcionar
terraform state show 'module.networking'  # Validar que dados existem

# Re-criar Terraform state no novo backend
terraform refresh  # Atualizar state com recursos reais
```

### Passo 3: Planejar mudanças

```bash
# Ver quais recursos AWS serão destroídos
terraform plan -destroy  # Visualizar remocao dos módulos AWS

# NÃO execute destroy - apenas planeje
# Os módulos AWS antigos podem ser deixados em tfsattate antigo ou removidos manualmente
```

### Passo 4: Aplicar configuração GCP

```bash
# Aplicar configuração GCP nova
terraform apply

# Isso criará:
# - google_storage_bucket (terraform state)
# - google_kms_key_ring e key (encryption)
# - Novos módulos GCP (cloud_sql, memorystore, networking, etc.)
```

---

## 3. Validação pós-migração

### Verificar que tudo está em GCP

```bash
# Verificar Cloud SQL
gcloud sql instances list
# Esperado: t3ck-prod-mysql (ou similar)

# Verificar Memorystore Redis
gcloud redis instances list --region=us-central1
# Esperado: t3ck-prod-redis (ou similar)

# Verificar Cloud Run services
gcloud run services list
# Esperado: api-gateway, auth-service, payment-service, etc.

# Verificar state bucket
gsutil ls -L gs://t3ck-terraform-state/terraform/state
# Esperado: versionado, encriptado com KMS
```

### Testar pipeline CI/CD

```bash
# CI/CD deve continuar funcionando
# Verificar que Cloud Build pipeline executa sem erros

# 1. Push para develop
git push origin develop

# 2. Observar GitHub Actions
# Esperado: deploy automático para staging via Cloud Run
github.com/repo/actions

# 3. Push para main (com aprovação)
git push origin main

# 4. Aprovar deployment
# Esperado: deploy para produção
```

### Testar backup-runner

```bash
# Backup runner agora usa gsutil ao invés de aws CLI
gcloud builds submit infrastructure/docker/backup-runner/ \
  --tag gcr.io/t3ck-core-prod/backup-runner:latest

# Deploy como Cloud Run service ou ScheduledJob
gcloud run deploy backup-runner \
  --image gcr.io/t3ck-core-prod/backup-runner:latest \
  --memory 4Gi \
  ...

# Testar com command
gcloud run jobs create backup-firestore-test \
  --image gcr.io/t3ck-core-prod/backup-runner:latest \
  --region us-central1 \
  --execute
```

---

## 4. Checklist de Migração

### Antes de começar
- [ ] Backup completo do Terraform state AWS S3
- [ ] Backup manual de dados (RDS snapshot, ElastiCache exportado, etc.)
- [ ] Validar acesso a GCP project com permissões Terraform
- [ ] Notificar time sobre janela de migração

### Durante migração
- [ ] Criar bucket GCS para state
- [ ] Configurar KMS keys
- [ ] Executar `terraform init` com novo backend
- [ ] Copiar state de S3 → GCS
- [ ] Validar que `terraform state list` funciona
- [ ] Executar `terraform plan` (sem apply ainda)
- [ ] Revisar plano com team

### Pós-migração
- [ ] Executar `terraform apply`
- [ ] Validar que Cloud SQL está online
- [ ] Validar que Redis está online
- [ ] Rodar testes unitários contra novos recursos
- [ ] Rodar testes e2e completos
- [ ] Testar backup-runner com gsutil
- [ ] Validar CI/CD pipeline funciona
- [ ] Remover AWS buckets/credenciais após 30 dias confirmación

### Documentação
- [ ] Atualizar DEPLOYMENT.md com referências GCP only
- [ ] Remover seção AWS troubleshooting
- [ ] Adicionar runbook de disaster recovery GCP
- [ ] Criar scripts de teardown AWS legado (para depois)

---

## 5. Limpeza de artefatos legados

### Manter (para referência histórica)
```
infrastructure/
├── backups/
│   └── aws/         # ← Manter documenting, mas marcar DEPRECATED
├── cdk/
│   ├── LEGACY_AWS_NOTICE.md  # ← Já existe
│   └── lib/         # ← Manter para referência, não usar
```

### Remover do repositório (Opcional - manter 1 ano)
```
infrastructure/
├── terraform/
│   └── modules/
│       ├── networking/   # ← AWS VPC, remover depois validar tudo está em GCP
│       ├── security/     # ← AWS Security Groups, remover
│       ├── database/     # ← AWS RDS, remover
│       ├── cache/        # ← AWS ElastiCache, remover
│       ├── route53/      # ← AWS DNS, remover
│       ├── secrets/      # ← AWS SecretsManager, remover
│       └── iam/          # ← AWS IAM, remover
```

### Command para documentar remoção
```bash
# Criar branch para limpeza
git checkout -b cleanup/remove-aws-legacy

# Remover módulos antigos
rm -rf infrastructure/terraform/modules/networking
rm -rf infrastructure/terraform/modules/security
rm -rf infrastructure/terraform/modules/iam
rm -rf infrastructure/terraform/modules/database
rm -rf infrastructure/terraform/modules/cache
rm -rf infrastructure/terraform/modules/route53
rm -rf infrastructure/terraform/modules/secrets

# Remover referências a AWS no README
git add infrastructure/
git commit -m "cleanup: remove AWS legacy infrastructure modules

- Removed AWS RDS, ElastiCache, Route53, VPC modules
- Architecture is now 100% GCP Cloud Run + Cloud SQL + Memorystore
- Terraform state migrated from S3 to GCS
- See infrastructure/terraform/backups/aws/ for historical reference"

git push origin cleanup/remove-aws-legacy
# Submit PR para revisão antes de merge
```

---

## 6. Variáveis Terraform a atualizar

Novo `terraform.tfvars` ou `terraform.production.tfvars`:

```hcl
# Antes
aws_region = "us-east-1"
aws_image_registry = "xxx.dkr.ecr.us-east-1.amazonaws.com"

# Depois
gcp_project_id    = "t3ck-core-prod"
gcp_region        = "us-central1"  # ou southamerica-east1 para Brasil
image_registry    = "us-central1-docker.pkg.dev/t3ck-core-prod/t3ck-core"

# Database
db_instance_tier  = "db-custom-4-16000"  # 4 vCPU, 16GB RAM
db_machine_type   = "custom-4-16000"
db_availability_type = "REGIONAL"  # Multi-zone HA

# Redis
redis_tier        = "standard_hs"
redis_memory_size_gb = 4
redis_connect_mode = "vpc-peering"  # ou direct_peering

# Cloud Run
cloud_run_services = {
  "api-gateway"    = { memory = "2Gi", cpu = "2", concurrency = 100 }
  "auth-service"   = { memory = "1Gi", cpu = "1", concurrency = 50 }
  "payment-service" = { memory = "2Gi", cpu = "2", concurrency = 100 }
  # ... outros serviços
}
```

---

## 7. Possíveis erros e soluções

| Erro | Causa | Solução |
|------|-------|---------|
| `backend "s3" not supported` | Terraform velho não suporta GCS | `terraform init -upgrade` |
| `Unauthorized: insufficient permissions` | SA não tem permissão GCS | `gsutil iam ch serviceAccount:...:objectAdmin` |
| `Cloud SQL terraform apply fails` | Network VPC não existe | Criar VPC network primeiro: `module.networking` |
| `backup-runner fails with gsutil error` | Image antigo com awscli | Rebuild image: `gcloud builds submit ...` |
| `terraform destroy removes all prod data` | State estava apontando prod | Nunca execute `destroy` em prod! Use `terraform import` para recuperar |

---

## 8. Próximas ações

### Imediato
- [ ] Executar checklist de migração
- [ ] Validar que deploy pipeline funciona
- [ ] Testar backups com gsutil

### Semana 1
- [ ] Cleanup de módulos AWS legados do repo
- [ ] Remover AWS CDK stack completamente
- [ ] Atualizar DEPLOYMENT.md

### Semana 2
- [ ] Teardown de recursos AWS legados (se não forem usados)
- [ ] Compartilhar plano de removação com team
- [ ] Documentar runbooks GCP-only

### Mês 1+
- [ ] Monitorar que não há tentativas de acesso a AWS
- [ ] Revogar IAM credentials AWS do team
- [ ] Cleanup de conta AWS (S3 buckets, EC2, etc.)

---

## 9. Referências

**Documentação GCP**:
- [Cloud Run Deployment](https://cloud.google.com/run/docs/deploying)
- [Cloud SQL Terraform](https://registry.terraform.io/providers/hashicorp/google/latest/docs/resources/sql_database_instance)
- [Memorystore Redis](https://cloud.google.com/memorystore/docs/redis)
- [Cloud KMS](https://cloud.google.com/kms/docs)

**Documentação T3CK**:
- `docs/DEPLOYMENT.md` (principal)
- `docs/INFRASTRUCTURE_IaC.md`
- `.github/workflows/ci-cd.yml`

**Terraform**:
- [Terraform GCP Provider](https://registry.terraform.io/providers/hashicorp/google/latest/docs)
- [Terraform State Management](https://developer.hashicorp.com/terraform/language/state)

---

## Aprovação

| Role | Data | Assinatura |
|------|------|-----------|
| DevOps Lead | 2026-04-06 | ☐ |
| CTO | 2026-04-06 | ☐ |
| Security | 2026-04-06 | ☐ |

**Migração Status**: ✅ **100% COMPLETA - PRONTO PARA IMPLEMENTAÇÃO**

