# GitHub Secrets Configuration

Este documento descreve os secrets necessários para CI/CD funcionando corretamente com **Google Cloud Run** e serviços gerenciados do GCP.

## 🔒 Secrets Obrigatórios

Configure estes secrets em `Settings → Secrets and variables → Actions`:

### GCP Deployment

| Secret | Descrição | Exemplo |
|--------|-----------|---------|
| `GCP_PROJECT_ID` | ID do projeto GCP | `t3ck-core-prod` |
| `GCP_REGION` | Região principal | `us-central1` |
| `GCP_SERVICE_ACCOUNT_KEY` | JSON da service account para CI/CD | `{...}` |
| `ARTIFACT_REGISTRY_REPOSITORY` | Repositório Docker no Artifact Registry | `t3ck-core` |

**Permissões mínimas recomendadas para a service account:**
- Artifact Registry Writer
- Cloud Run Admin
- Cloud Build Editor
- Service Account User
- Secret Manager Secret Accessor (apenas se o workflow precisar ler segredos)

### Staging Environment

| Secret | Descrição | Exemplo |
|--------|-----------|---------|
| `STAGING_URL` | URL do ambiente staging | `https://staging-gateway-xyz.run.app` |

### Production Environment

| Secret | Descrição | Exemplo |
|--------|-----------|---------|
| `PROD_URL` | URL do ambiente production | `https://api.t3ck.com` |

### Notificações (Opcional)

| Secret | Descrição | Exemplo |
|--------|-----------|---------|
| `SLACK_WEBHOOK` | Webhook do Slack para notificações | `https://hooks.slack.com/services/...` |

## 🔐 Configuração de Environment Secrets

### Staging Environment
**Location:** `Settings → Environments → staging → Environment secrets`

```
STAGING_URL=https://staging-gateway-xyz.run.app
```

### Production Environment
**Location:** `Settings → Environments → production → Environment secrets`

```
PROD_URL=https://api.t3ck.com
```

## 📋 Checklist de Setup

- [ ] Projeto GCP criado
- [ ] Service account de deploy criada
- [ ] `GCP_PROJECT_ID` adicionado a Secrets
- [ ] `GCP_REGION` adicionado a Secrets
- [ ] `GCP_SERVICE_ACCOUNT_KEY` adicionado a Secrets
- [ ] `ARTIFACT_REGISTRY_REPOSITORY` adicionado a Secrets
- [ ] Staging environment configurado
- [ ] Production environment configurado
- [ ] `STAGING_URL` adicionado
- [ ] `PROD_URL` adicionado
- [ ] `SLACK_WEBHOOK` adicionado (opcional mas recomendado)
- [ ] Verificar permissões IAM no GCP

## 🔄 Variáveis de Ambiente

Estas variáveis são definidas no workflow e não precisam de secrets:

```yaml
NODE_VERSION: '20'
SERVICE_PREFIX: t3ck
```

## 🚨 Troubleshooting

### "Permission denied" no deploy
- Verificar papéis da service account
- Confirmar acesso a Cloud Run, Artifact Registry e Cloud Build
- Atualizar `GCP_SERVICE_ACCOUNT_KEY`

### "Artifact Registry repository not found"
- Verificar se o repositório existe
- Confirmar região e nome em `ARTIFACT_REGISTRY_REPOSITORY`

### "Cloud Run deploy failed"
- Verificar logs do GitHub Actions
- Verificar revisões e logs no Cloud Run
- Confirmar variáveis de ambiente e secrets de runtime

## 📝 Rotação de Secrets

**Frequência recomendada:** A cada 90 dias

1. Gerar nova chave ou credencial da service account conforme política interna
2. Atualizar `GCP_SERVICE_ACCOUNT_KEY`
3. Validar o pipeline
4. Revogar material antigo após confirmação

## 🔑 Suporte

Para suporte ou dúvidas:
1. Consulte a documentação do GitHub Actions
2. Verifique os logs de workflow
3. Consulte Cloud Run, Cloud Build e Artifact Registry no GCP
4. Contacte o time DevOps
