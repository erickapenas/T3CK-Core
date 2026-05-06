# GitHub Secrets Configuration

Este documento descreve todos os secrets necessários para CI/CD funcionando corretamente.

## 🔒 Secrets Obrigatórios

Configure estes secrets em `Settings → Secrets and variables → Actions`:

### AWS Credentials

| Secret                  | Descrição               | Exemplo                                    |
| ----------------------- | ----------------------- | ------------------------------------------ |
| `AWS_ACCESS_KEY_ID`     | AWS IAM User Access Key | `AKIAIOSFODNN7EXAMPLE`                     |
| `AWS_SECRET_ACCESS_KEY` | AWS IAM User Secret Key | `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY` |

**Permissões mínimas necessárias:**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecr:GetAuthorizationToken",
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer",
        "ecr:PutImage",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "ecs:UpdateService",
        "ecs:DescribeServices",
        "ecs:DescribeTaskDefinition",
        "ecs:DescribeTaskDefinition"
      ],
      "Resource": [
        "arn:aws:ecs:us-east-1:ACCOUNT_ID:service/t3ck-cluster/*",
        "arn:aws:ecs:us-east-1:ACCOUNT_ID:task-definition/*"
      ]
    }
  ]
}
```

### Staging Environment

| Secret        | Descrição               | Exemplo            |
| ------------- | ----------------------- | ------------------ |
| `STAGING_URL` | URL do ambiente staging | `staging.t3ck.dev` |

### Production Environment

| Secret     | Descrição                  | Exemplo        |
| ---------- | -------------------------- | -------------- |
| `PROD_URL` | URL do ambiente production | `api.t3ck.com` |

### Notificações (Opcional)

| Secret          | Descrição                          | Exemplo                                |
| --------------- | ---------------------------------- | -------------------------------------- |
| `SLACK_WEBHOOK` | Webhook do Slack para notificações | `https://hooks.slack.com/services/...` |

## 🔐 Configuração de Environment Secrets

### Staging Environment

**Location:** `Settings → Environments → staging → Environment secrets`

```
STAGING_URL=staging.t3ck.dev
```

### Production Environment

**Location:** `Settings → Environments → production → Environment secrets`

```
PROD_URL=api.t3ck.com
```

## 📋 Checklist de Setup

- [ ] AWS IAM User criado
- [ ] `AWS_ACCESS_KEY_ID` adicionado a Secrets
- [ ] `AWS_SECRET_ACCESS_KEY` adicionado a Secrets
- [ ] Staging environment configurado
- [ ] Production environment configurado
- [ ] `STAGING_URL` adicionado
- [ ] `PROD_URL` adicionado
- [ ] `SLACK_WEBHOOK` adicionado (opcional mas recomendado)
- [ ] Verificar permissões IAM

## 🔄 Variáveis de Ambiente

Estas variáveis são definidas no workflow e não precisam de secrets:

```yaml
AWS_REGION: us-east-1
NODE_VERSION: '20'
ECR_REGISTRY: (obtido do login-ecr)
```

## 🚨 Troubleshooting

### "Not authorized to perform: ecr:GetAuthorizationToken"

- Verificar se IAM user tem permissão para ECR
- Regenerar Access Key
- Atualizar secrets

### "ECS service not found"

- Verificar se cluster e services existem
- Verificar se nome do cluster está correto (t3ck-cluster)
- Verificar se nomes dos services estão corretos

### "Service deployment failed"

- Verificar logs do ECS
- Verificar CloudWatch logs
- Verificar se task definition está válida

## 📝 Rotação de Secrets

**Frequência recomendada:** A cada 90 dias

1. Gerar novo AWS Access Key no IAM Console
2. Atualizar `AWS_ACCESS_KEY_ID` e `AWS_SECRET_ACCESS_KEY`
3. Desativar chave antiga
4. Deletar chave antiga após confirmação

## 🔑 Suporte

Para suporte ou dúvidas:

1. Consulte a documentação do GitHub Actions
2. Verifique os logs de workflow
3. Contacte o time DevOps
