# Legacy AWS Infrastructure Notice

O conteúdo de `infrastructure/cdk/` representa infraestrutura **legada** baseada em AWS.

## Status

- **Não é mais a stack principal do projeto**
- A plataforma oficial atual é **Google Cloud Run + GCP managed services**
- Este diretório deve ser tratado apenas como referência histórica ou apoio de migração

## Plataforma principal atual

Use como referência principal:
- `infrastructure/scripts/deploy-cloud-run.ps1`
- `docs/CLOUD_RUN_EXAMPLE.md`
- `docs/DEPLOYMENT.md`
- `docs/INFRASTRUCTURE_IaC.md`

## Serviços GCP-alvo

- Cloud Run
- Artifact Registry
- Cloud Build
- Cloud Armor
- Cloud Logging / Cloud Monitoring
- Cloud SQL for MySQL
- Memorystore for Redis
- Secret Manager
- Cloud KMS

## Regra de uso

Não expandir `infrastructure/cdk/` para novas features. Qualquer evolução de infraestrutura deve seguir a stack GCP/Cloud Run.
