# Motor T3CK - Plataforma Core

Plataforma multi-tenant escalável para suportar 60+ implantações por ano.

## 🚀 Quick Start

```bash
# 1. Clone o repositório
git clone <repository-url>
cd motor-t3ck

# 2. Execute o setup
./scripts/setup.sh  # Linux/macOS
# ou
.\scripts\setup.ps1  # Windows

# 3. Configure o arquivo .env
cp .env.example .env
# Edite .env com suas credenciais

# 4. Inicie os serviços
pnpm dev
```

📖 Veja o [Quick Start Guide](docs/QUICKSTART.md) para mais detalhes.

## Arquitetura

- **Cloud**: AWS
- **IaC**: Terraform + AWS CDK
- **Runtime**: Node.js/TypeScript
- **Database**: Firebase (Firestore + Auth + Storage)
- **Containerização**: Docker + ECS Fargate
- **CI/CD**: GitHub Actions

## Estrutura do Projeto

```
motor-t3ck/
├── infrastructure/     # Infraestrutura como Código
│   ├── terraform/     # Módulos Terraform
│   ├── cdk/           # AWS CDK stacks
│   └── scripts/       # Scripts de provisionamento
├── packages/          # Pacotes compartilhados
│   ├── sdk/           # @t3ck/sdk
│   └── shared/        # Código compartilhado
├── services/          # Microserviços
│   ├── auth-service/  # Autenticação e segurança
│   ├── webhook-service/ # Webhooks e eventos
│   └── tenant-service/  # Gerenciamento de tenants
├── examples/          # Exemplos de uso
├── docs/              # Documentação
└── .github/           # CI/CD workflows
```

## 📚 Documentação

- [Quick Start Guide](docs/QUICKSTART.md) - Comece aqui!
- [Arquitetura](docs/ARCHITECTURE.md) - Visão geral da arquitetura
- [API Reference](docs/API.md) - Documentação da API
- [Provisionamento](docs/PROVISIONING.md) - Guia de provisionamento
- [Deploy](docs/DEPLOYMENT.md) - Guia de deploy

## Desenvolvimento

### Pré-requisitos

- Node.js >= 18
- pnpm >= 8
- Terraform >= 1.5 (opcional)
- AWS CLI (opcional)
- Docker (opcional)

### Comandos Disponíveis

```bash
# Instalar dependências
pnpm install

# Build
pnpm build

# Testes
pnpm test
pnpm test:coverage  # Com coverage
pnpm test:watch     # Watch mode

# Lint e formatação
pnpm lint
pnpm lint:fix
pnpm format
pnpm format:check

# Desenvolvimento
pnpm dev  # Inicia todos os serviços

# Type check
pnpm type-check
```

## Provisionamento de Tenant

```bash
# Provisionar novo tenant (< 10 minutos)
./infrastructure/scripts/provision-tenant.sh \
  --tenant-id "cliente-123" \
  --domain "cliente.t3ck.com" \
  --region "us-east-1"
```

## Usando o SDK

```typescript
import { createT3CK } from '@t3ck/sdk';

const t3ck = createT3CK({
  apiKey: 'your-api-key',
  baseUrl: 'https://api.t3ck.com',
});

// Adicionar produto ao carrinho
await t3ck.cart.add(product, 2);

// Buscar produtos
const results = await t3ck.catalog.search({ query: 'notebook' });

// Criar pedido
const order = await t3ck.checkout.create({
  shippingAddress: { /* ... */ },
  paymentMethod: 'credit_card',
});
```

Veja [exemplos](examples/) para mais detalhes.

## CI/CD

- **Staging**: Deploy automático em push para `develop`
- **Production**: Deploy manual com aprovação em `main`
- **Quality Gates**: Coverage mínimo 80%, security scanning

## Contribuindo

Veja [CONTRIBUTING.md](CONTRIBUTING.md) para diretrizes de contribuição.

## Licença

MIT License - Veja [LICENSE](LICENSE) para detalhes.
