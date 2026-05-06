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
│   ├── api-gateway/     # API Gateway (routing, auth, security)
│   ├── auth-service/    # Autenticação e segurança
│   ├── webhook-service/ # Webhooks e eventos
│   ├── tenant-service/  # Gerenciamento de tenants
│   ├── product-service/ # Catálogo, estoque e recomendações
│   ├── admin-service/   # Gestão administrativa (API)
│   ├── admin-dashboard/ # Dashboard React administrativo
│   ├── media-service/   # Transformação de imagens (WebP/AVIF)
│   └── edge-service/    # Pre-rendering e SSG/ISR/SSR
├── examples/          # Exemplos de uso
├── docs/              # Documentação
└── .github/           # CI/CD workflows
```

## 📚 Documentação

- [Quick Start Guide](docs/QUICKSTART.md) - Comece aqui!
- [Arquitetura](docs/ARCHITECTURE.md) - Visão geral da arquitetura
- [API Reference](docs/API.md) - Documentação da API
- [Provisionamento](docs/PROVISIONING.md) - Guia de provisionamento
- [Cloud Run Example](docs/CLOUD_RUN_EXAMPLE.md) - Deploy de exemplo no GCP Cloud Run
- [Deploy](docs/DEPLOYMENT.md) - Guia de deploy
- [API Gateway Implementation](API_GATEWAY_IMPLEMENTATION.md) - Implementação do API Gateway
- [Performance Services](PERFORMANCE_SERVICES_IMPLEMENTATION.md) - Serviços de performance (Media + Edge)

## Desenvolvimento

### Pré-requisitos

- Node.js >= 18
- pnpm >= 8
- Terraform >= 1.5 (opcional)
- AWS CLI (opcional)
- Docker (opcional)

### Variáveis JWT obrigatórias (RS256)

Para o `auth-service`, configure no `.env`:

```bash
JWT_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----
JWT_PUBLIC_KEY=-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----
JWT_EXPIRATION=3600
JWT_REFRESH_EXPIRATION=604800
```

Gerando chaves (OpenSSL):

```bash
openssl genrsa -out private.key 2048
openssl rsa -in private.key -pubout -out public.key
```

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
pnpm dev:core  # Apenas core services (auth, webhook, tenant, product)
pnpm dev:admin  # Apenas admin (admin-service + dashboard)
pnpm dev:performance  # Apenas performance (media + edge)

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
  shippingAddress: {
    /* ... */
  },
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
