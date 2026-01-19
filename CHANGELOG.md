# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2024-01-01

### Added

#### Infraestrutura
- Configuração completa de monorepo com pnpm workspaces
- Módulos Terraform para VPC, networking, security groups, IAM, storage
- Stack AWS CDK com ECS Fargate, ALB, Lambda, EventBridge, API Gateway
- Scripts de provisionamento (Bash e PowerShell)
- Configuração de observabilidade com CloudWatch

#### SDK
- SDK interno `@t3ck/sdk` com módulos:
  - Cart: operações de carrinho
  - Catalog: busca e gerenciamento de produtos
  - Checkout: criação e gerenciamento de pedidos
  - Settings: configurações do tenant
- Cliente HTTP com retry automático e error handling
- Tipos TypeScript completos

#### Serviços
- **Auth Service**: Autenticação OAuth2/OIDC, criptografia, rate limiting, proteção contra fraudes
- **Webhook Service**: Gerenciamento de webhooks, retry logic, dead letter queue
- **Tenant Service**: Validação de formulários, state machine de provisionamento

#### CI/CD
- GitHub Actions workflows para lint, test, build, deploy
- Quality gates (coverage mínimo 80%, security scanning)
- Deploy automático para staging
- Deploy manual para production

#### Documentação
- README principal
- Guia de arquitetura
- Guia de provisionamento
- Guia de deploy
- Quick start guide
- API reference
- Exemplos de uso

#### Desenvolvimento
- Scripts de setup (Linux/macOS e Windows)
- Scripts para desenvolvimento local
- Configuração de testes com Jest
- ESLint e Prettier configurados
- Dockerfiles para todos os serviços

### Security
- Autenticação híbrida (Firebase Auth + AWS Cognito)
- Criptografia de dados sensíveis com AWS KMS
- Rate limiting por tenant, usuário e IP
- Proteção contra fraudes com validação de tokens e session management
- Security groups configurados para todos os recursos

[1.0.0]: https://github.com/t3ck/motor-t3ck/releases/tag/v1.0.0
