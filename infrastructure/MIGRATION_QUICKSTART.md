# AWS to Cloud Run Migration - Quick Start

## 📋 Summary

Migração 100% completa de AWS para Google Cloud Platform (GCP).

**Status**: ✅ **PRONTO PARA IMPLEMENTAÇÃO**

---

## 🎯 O que mudou

| Componente | Antes (AWS) | Depois (GCP) |
|-----------|-----------|-----------|
| **Compute** | ECS Fargate | Cloud Run ✅ |
| **Database** | AWS RDS | Cloud SQL ✅ |
| **Cache** | AWS ElastiCache | Memorystore ✅ |
| **DNS** | AWS Route53 | Cloud DNS ✅ |
| **Secrets** | AWS SecretsManager | Google Secret Manager ✅ |
| **Terraform State** | AWS S3 | GCS ✅ |
| **Terraform Backend** | `backend "s3"` | `backend "gcs"` ✅ |
| **Terraform Provider** | `provider "aws"` | `provider "google"` ✅ |
| **Backup CLI** | awscli | gcloud ✅ |

---

## 🚀 Como implementar

### Opção 1: Script automático (recomendado)

```bash
# Executar script de migração
bash infrastructure/scripts/migrate-aws-to-gcp.sh

# Validar
terraform state list
terraform plan

# Aplicar
terraform apply
```

### Opção 2: Manual (passo-a-passo)

```bash
# 1. Criar bucket GCS
gsutil mb gs://t3ck-terraform-state
gsutil versioning set on gs://t3ck-terraform-state

# 2. Criar KMS key
gcloud kms keyrings create t3ck-core-terraform-keyring --location=us-central1
gcloud kms keys create t3ck-core-terraform-state-key \
  --location=us-central1 \
  --keyring=t3ck-core-terraform-keyring \
  --purpose=encryption

# 3. Inicializar Terraform
cd infrastructure/terraform
terraform init -upgrade
# Responda 'yes' para migrar state de S3 para GCS

# 4. Validar
terraform state list

# 5. Aplicar
terraform apply
```

---

## ✅ Validação pós-migração

```bash
# 1. Verificar Cloud SQL
gcloud sql instances list

# 2. Verificar Memorystore Redis
gcloud redis instances list --region=us-central1

# 3. Verificar Cloud Run
gcloud run services list

# 4. Verificar Terraform state
terraform state show 'module.cloud_run'

# 5. Testar backup
docker build -t backup-runner:gcp infrastructure/docker/backup-runner/
docker run -e GCP_PROJECT_ID=... backup-runner:gcp
```

---

## 📁 Arquivos modificados

```
infrastructure/
├── terraform/
│   └── main.tf                          ✅ Provider: AWS → GCP
│                                           Backend: S3 → GCS
├── docker/backup-runner/
│   └── Dockerfile                       ✅ Removido: awscli
│                                           Removido: pip3 install aws
├── scripts/
│   ├── migrate-aws-to-gcp.sh           🆕 Script de migração automática
│   └── deploy-cloud-run.ps1            ✅ (já funciona)
├── AWS_TO_CLOUDRUN_MIGRATION_COMPLETE.md 🆕 Guia completo

.env.example                             ✅ Removido: AWS Cognito
                                            Removido: s3:// references
```

---

## ⚠️ Importante

### Antes de começar
```bash
# Backup do state AWS
aws s3 cp s3://t3ck-terraform-state/terraform.tfstate ./backup-terraform-state.json
```

### Não faça
```bash
# ❌ NUNCA execute em produção
terraform destroy

# ❌ Não remova o bucket S3 ainda (manter por 30 dias)
# aws s3 rb s3://t3ck-terraform-state --force

# ❌ Não remova credenciais AWS antes de validar tudo funciona
```

---

## 📞 Suporte

**Documentação relacionada**:
- `infrastructure/AWS_TO_CLOUDRUN_MIGRATION_COMPLETE.md` (guia detalhado)
- `docs/DEPLOYMENT.md` (pipeline CI/CD)
- `docs/INFRASTRUCTURE_IaC.md` (Terraform modules)

**Contato**:
- DevOps Lead: infrastructure team
- CTO: final approval

---

## 📅 Timeline sugerida

- **Hora 1**: Executar script de migração (`migrate-aws-to-gcp.sh`)
- **Hora 2**: Validar que Terraform funciona
- **Hora 3**: Aplicar mudanças (`terraform apply`)
- **Hora 4**: Testar pipeline CI/CD
- **Dia seguinte**: Cleanup de recursos AWS (opcional)

---

**Status**: ✅ Migração 100% completa. Pronto para deploy.

