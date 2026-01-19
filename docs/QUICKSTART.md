# Quick Start Guide

## Setup Inicial

### 1. Pré-requisitos

- Node.js >= 18
- pnpm >= 8
- Terraform >= 1.5.0 (opcional, para IaC)
- AWS CLI (opcional, para deploy)
- Docker (opcional, para containers)

### 2. Clone e Instale

```bash
# Clone o repositório
git clone <repository-url>
cd motor-t3ck

# Execute o script de setup
# Linux/macOS:
./scripts/setup.sh

# Windows:
.\scripts\setup.ps1
```

### 3. Configure Variáveis de Ambiente

Copie `.env.example` para `.env` e configure:

```bash
cp .env.example .env
# Edite .env com suas credenciais
```

Principais variáveis a configurar:

- `AWS_REGION`: Região AWS (ex: us-east-1)
- `AWS_ACCOUNT_ID`: Seu AWS Account ID
- `FIREBASE_PROJECT_ID`: ID do projeto Firebase
- `JWT_SECRET`: Chave secreta para JWT (gere uma aleatória)
- `REDIS_URL`: URL do Redis (ou use localhost para desenvolvimento)

### 4. Configure AWS CLI

```bash
aws configure
```

### 5. Configure Firebase

```bash
firebase login
firebase projects:list
```

## Desenvolvimento

### Rodar Serviços Localmente

```bash
# Opção 1: Usando script
./scripts/dev.sh  # Linux/macOS
.\scripts\dev.ps1 # Windows

# Opção 2: Usando pnpm
pnpm dev
```

Serviços estarão disponíveis em:

- Auth Service: http://localhost:3001
- Webhook Service: http://localhost:3002
- Tenant Service: http://localhost:3003

### Executar Testes

```bash
# Todos os testes
pnpm test

# Com coverage
pnpm test:coverage

# Watch mode
pnpm test:watch
```

### Lint e Formatação

```bash
# Verificar lint
pnpm lint

# Corrigir automaticamente
pnpm lint:fix

# Verificar formatação
pnpm format:check

# Formatar código
pnpm format
```

## Provisionamento de Tenant

### Primeira Execução

1. Configure o backend S3 do Terraform:

```bash
cd infrastructure/terraform
terraform init
```

2. Execute o script de provisionamento:

```bash
# Linux/macOS
./infrastructure/scripts/provision-tenant.sh \
  --tenant-id "test-tenant" \
  --domain "test.t3ck.com" \
  --region "us-east-1"

# Windows
.\infrastructure\scripts\provision-tenant.ps1 `
  -TenantId "test-tenant" `
  -Domain "test.t3ck.com" `
  -Region "us-east-1"
```

## Usando o SDK

```typescript
import { createT3CK } from '@t3ck/sdk';

const t3ck = createT3CK({
  apiKey: process.env.API_KEY!,
  baseUrl: 'https://api.t3ck.com',
});

// Exemplo: Adicionar produto ao carrinho
const product = {
  id: 'prod-123',
  name: 'Notebook',
  price: 2999.99,
};

await t3ck.cart.add(product, 1);
const cart = await t3ck.cart.get();
console.log(cart);
```

## Deploy

### Staging (Automático)

Push para branch `develop`:

```bash
git checkout develop
git push origin develop
```

O GitHub Actions fará deploy automático.

### Production (Manual)

1. Merge para `main`:

```bash
git checkout main
git merge develop
git push origin main
```

2. Aprovar o deploy no GitHub Actions

## Troubleshooting

### Erro: "Module not found"

Execute `pnpm install` novamente.

### Erro: "AWS credentials not found"

Configure AWS CLI: `aws configure`

### Erro: "Firebase not initialized"

Verifique se `FIREBASE_SERVICE_ACCOUNT_KEY_PATH` está configurado no `.env`.

### Serviços não iniciam

Verifique se as portas 3001, 3002, 3003 estão livres:

```bash
# Linux/macOS
lsof -i :3001

# Windows
netstat -ano | findstr :3001
```

## Próximos Passos

1. Leia [ARCHITECTURE.md](./ARCHITECTURE.md) para entender a arquitetura
2. Veja [PROVISIONING.md](./PROVISIONING.md) para detalhes de provisionamento
3. Consulte [DEPLOYMENT.md](./DEPLOYMENT.md) para guia de deploy completo
