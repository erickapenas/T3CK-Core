# Guia de Provisionamento

## Pré-requisitos

- AWS CLI configurado
- Terraform >= 1.5.0
- AWS CDK CLI
- Node.js >= 18
- pnpm >= 8
- Firebase CLI (opcional)

## Provisionamento de Novo Tenant

### Linux/macOS

```bash
./infrastructure/scripts/provision-tenant.sh \
  --tenant-id "cliente-123" \
  --domain "cliente.t3ck.com" \
  --region "us-east-1" \
  --firebase-project-id "t3ck-cliente-123" \
  --db-password "SENHA_FORTE_AQUI" \
  --tfvars "infrastructure/terraform/terraform.staging.tfvars"
```

### Windows (PowerShell)

```powershell
.\infrastructure\scripts\provision-tenant.ps1 `
  -TenantId "cliente-123" `
  -Domain "cliente.t3ck.com" `
  -Region "us-east-1" `
  -FirebaseProjectId "t3ck-cliente-123" `
  -DbPassword "SENHA_FORTE_AQUI" `
  -TfvarsFile "infrastructure\terraform\terraform.staging.tfvars"
```

## Credenciais do Banco de Dados

Se você não informar `--db-password`/`-DbPassword`, o Terraform gera uma senha aleatória e a armazena no Secrets Manager junto com as demais credenciais. Em ambientes reais, prefira usar um arquivo .tfvars por ambiente (staging/production) e/ou um gerenciador de segredos para evitar passar senha via linha de comando.

## Arquivos .tfvars por ambiente

Exemplos disponíveis:

- [infrastructure/terraform/terraform.staging.tfvars.example](infrastructure/terraform/terraform.staging.tfvars.example)
- [infrastructure/terraform/terraform.production.tfvars.example](infrastructure/terraform/terraform.production.tfvars.example)

Arquivos prontos para uso (edite a senha antes de executar):

- [infrastructure/terraform/terraform.staging.tfvars](infrastructure/terraform/terraform.staging.tfvars)
- [infrastructure/terraform/terraform.production.tfvars](infrastructure/terraform/terraform.production.tfvars)

## Validações

O script valida:

- Tenant ID: 3-50 caracteres alfanuméricos com hífens
- Domain: Formato válido de domínio
- Região AWS: Deve existir e estar acessível

## Saída

Após o provisionamento bem-sucedido, você receberá:

- Tenant ID
- Domain configurado
- ALB DNS
- API Key e Secret Key (armazenados no Secrets Manager)
- Tempo de execução

## Benchmark de tempo (SLA < 10 min)

Os scripts agora exibem o tempo total e o tempo por etapa. Registre os resultados e mantenha o histórico para garantir o SLA.

Exemplo de saída resumida:

```
Duration: 8m 42s
Step timings:
- Validate inputs: 1s
- Terraform: 210s
- CDK: 160s
- Firebase: 35s
- Route53: 12s
- Deploy containers: 5s
- API keys: 3s
- Health checks: 96s
```

Recomendação: rodar 3 vezes e usar a média, registrando em um spreadsheet de métricas de implantação.

## Troubleshooting

### Terraform falha

- Verificar credenciais AWS
- Verificar permissões IAM
- Verificar estado do Terraform

### CDK falha

- Verificar se o Terraform foi executado primeiro
- Verificar outputs do Terraform
- Verificar permissões CDK

### Health checks falham

- Aguardar mais tempo para serviços iniciarem
- Verificar logs do ECS
- Verificar security groups
