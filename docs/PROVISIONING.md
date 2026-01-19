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
  --firebase-project-id "t3ck-cliente-123"
```

### Windows (PowerShell)

```powershell
.\infrastructure\scripts\provision-tenant.ps1 `
  -TenantId "cliente-123" `
  -Domain "cliente.t3ck.com" `
  -Region "us-east-1" `
  -FirebaseProjectId "t3ck-cliente-123"
```

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
