# 🛠️ Mapa Completo de Tecnologias - T3CK Core

**Data:** January 27, 2026  
**Versão:** 1.0.0  
**Escopo:** Inventário completo de todas as tecnologias, versões e propósitos

---

## 📋 Sumário Executivo

O T3CK Core utiliza uma stack tecnológica moderna e robusta de **42+ tecnologias** organizadas em:
- **Linguagens:** TypeScript, Bash, PowerShell, HCL (Terraform), YAML
- **Runtime:** Node.js 20.x, AWS Lambda
- **Cloud:** AWS (10+ serviços)
- **Banco de Dados:** Firebase Firestore, Redis
- **Testing:** Jest, Axios
- **CI/CD:** GitHub Actions
- **Infrastructure as Code:** AWS CDK 2.x, Terraform 1.5+
- **Observability:** CloudWatch, EventBridge
- **Containerization:** Docker, Alpine

---

## 🏗️ INFRAESTRUTURA & CLOUD

### AWS Services
| Serviço | Versão | Propósito | Status |
|---------|--------|----------|--------|
| **Step Functions** | V2 | Orquestração de provisioning com 9 estados | ✅ Implementado |
| **Lambda** | Node.js 20.x | Execução de tasks de provisioning | ✅ Implementado |
| **ECS (Fargate)** | Latest | Deployment de serviços containerizados | ✅ Implementado |
| **ECR** | Latest | Container image registry | ✅ Implementado |
| **CloudFormation** | Latest | Infrastructure as Code (via CDK) | ✅ Implementado |
| **S3** | Latest | Storage para logs, artifacts, backups | ✅ Terraform |
| **SQS** | Latest | Dead Letter Queue (DLQ) para provisioning | ✅ Implementado |
| **SNS** | Latest | Notificações de sucesso/falha | ✅ Implementado |
| **EventBridge** | Latest | Event bus para webhooks | ✅ Terraform |
| **Route53** | Latest | DNS e gerenciamento de domínios | ✅ Terraform |
| **ALB** | Latest | Application Load Balancer | ✅ Terraform |
| **VPC** | Latest | Networking (subnets, security groups) | ✅ Terraform |
| **IAM** | Latest | Identity & Access Management | ✅ Terraform |
| **Secrets Manager** | Latest | Gerenciamento de secrets | ✅ Terraform |
| **KMS** | Latest | Criptografia de dados | ✅ Terraform |
| **CloudWatch** | Latest | Logs e monitoring | ✅ Implementado |
| **CloudWatch Logs Insights** | Latest | Query de logs | ⏳ Não configurado |

### Infrastructure as Code
| Ferramenta | Versão | Propósito | Status |
|-----------|--------|----------|--------|
| **AWS CDK** | 2.100.0 | Infraestrutura em TypeScript | ✅ Implementado |
| **Terraform** | 1.5.0 | Infraestrutura em HCL | ✅ Implementado |
| **Constructs** | 10.3.0 | Building blocks para CDK | ✅ Implementado |

---

## 💻 LINGUAGENS & RUNTIMES

| Tecnologia | Versão | Propósito | Status |
|-----------|--------|----------|--------|
| **TypeScript** | 5.3.3 | Linguagem principal (type-safe) | ✅ Implementado |
| **Node.js** | 20.x | Runtime JavaScript/TypeScript | ✅ Implementado |
| **Bash** | Latest | Scripts Linux/macOS (smoke tests, rollback) | ✅ Implementado |
| **PowerShell** | 5.1+ | Scripts Windows (smoke tests, rollback) | ✅ Implementado |
| **HCL** | Latest | Linguagem Terraform | ✅ Implementado |
| **YAML** | Latest | GitHub Actions, Firestore rules | ✅ Implementado |
| **JSON** | Latest | Configuração e dados | ✅ Implementado |

---

## 🗄️ BANCOS DE DADOS

| Banco | Serviço | Versão | Propósito | Status |
|------|---------|--------|----------|--------|
| **Firestore** | Firebase | Latest | Database NoSQL para dados de tenant | ✅ Implementado |
| **Redis** | ioredis | 5.3.2 | Cache e session management | ✅ Auth-service |
| **CloudFormation** | AWS | Latest | Estado de infraestrutura (implicit) | ✅ Implementado |

### Firebase
| Componente | Versão | Propósito |
|-----------|--------|----------|
| firebase-admin | 12.0.0 | Admin SDK para autenticação |
| Firestore Rules | 2 | Security rules para dados |
| Firestore Indexes | Latest | Índices de query |
| Authentication | Latest | Firebase Auth OAuth2/OIDC |
| Storage Rules | 2 | Security para file storage |
| Emulators | Latest | Local development environment |

---

## 🔌 FRAMEWORKS & BIBLIOTECAS

### Backend
| Biblioteca | Versão | Propósito | Status |
|-----------|--------|----------|--------|
| **Express.js** | 4.18.2 | Web framework HTTP | ✅ Todos serviços |
| **JWT** | 9.0.2 | JSON Web Token handling | ✅ Auth-service |
| **Firebase Admin** | 12.0.0 | Firebase integration | ✅ Auth-service |
| **ioredis** | 5.3.2 | Redis client | ✅ Auth-service |
| **Axios** | 1.6.2+ | HTTP client | ✅ SDK, E2E tests |

### AWS SDK
| Módulo | Versão | Propósito | Status |
|--------|--------|----------|--------|
| @aws-sdk/client-cognito-identity-provider | 3.490.0 | Cognito authentication | ✅ Auth-service |
| @aws-sdk/client-kms | 3.490.0 | KMS encryption | ✅ Auth-service |
| aws-cdk-lib | 2.100.0 | AWS CDK infrastructure | ✅ Infrastructure |
| aws-lambda | N/A | Lambda handler types | ✅ Lambda functions |

---

## 🧪 TESTING & QUALITY

### Testing Framework
| Framework | Versão | Propósito | Status |
|-----------|--------|----------|--------|
| **Jest** | 29.7.0 | Unit testing framework | ✅ Implementado |
| **ts-jest** | 29.1.1 | Jest TypeScript support | ✅ Implementado |
| **@jest/globals** | 29.7.0 | Jest type definitions | ✅ E2E tests |
| **Axios** | 1.6.5 | HTTP testing client | ✅ E2E tests |

### Code Quality
| Ferramenta | Versão | Propósito | Status |
|-----------|--------|----------|--------|
| **ESLint** | 8.56.0 | Linting e code style | ✅ Implementado |
| **@typescript-eslint/parser** | 6.15.0 | TypeScript parser para ESLint | ✅ Implementado |
| **@typescript-eslint/eslint-plugin** | 6.15.0 | TypeScript rules | ✅ Implementado |
| **eslint-plugin-import** | 2.29.1 | Import organization | ✅ Implementado |
| **Prettier** | 3.1.1 | Code formatter | ✅ Implementado |
| **eslint-config-prettier** | 9.1.0 | Prettier integration com ESLint | ✅ Implementado |
| **Snyk** | Latest | Security scanning | ✅ CI/CD |
| **Dependabot** | GitHub | Dependency auditing | ✅ CI/CD |
| **Codecov** | Latest | Coverage reporting | ✅ CI/CD |

---

## 📦 PACKAGE MANAGER & BUILD

| Ferramenta | Versão | Propósito | Status |
|-----------|--------|----------|--------|
| **pnpm** | 8.15.0+ | Package manager (workspaces) | ✅ Implementado |
| **npm** | Built-in | Fallback package manager | ✅ Suportado |
| **TypeScript Compiler** | 5.3.3 | Build TypeScript → JavaScript | ✅ Implementado |

---

## 🐳 CONTAINERIZATION

| Tecnologia | Versão | Propósito | Status |
|-----------|--------|----------|--------|
| **Docker** | Latest | Container image building | ✅ 3 Dockerfiles |
| **Docker Alpine** | 20-alpine | Lightweight base image | ✅ Todos serviços |
| **Docker Compose** | Latest | Local orchestration | ⏳ Não implementado |

### Container Images
```
FROM node:20-alpine AS builder
  - Stage 1: Build (TypeScript → JS)
  - Dependencies: pnpm, TypeScript
  
FROM node:20-alpine (Production)
  - Stage 2: Minimal runtime
  - Only: dist/, package.json, node_modules
  - Size: ~200-300 MB
```

---

## 🔄 CI/CD & AUTOMATION

### GitHub Actions
| Workflow | Versão | Propósito | Status |
|----------|--------|----------|--------|
| **ci-cd.yml** | Latest | Main CI/CD pipeline | ✅ Implementado |
| **quality.yml** | Latest | Security & quality checks | ✅ Implementado |

### GitHub Actions Components
| Ação | Versão | Propósito |
|------|--------|----------|
| actions/checkout | v4 | Checkout code |
| actions/setup-node | v4 | Setup Node.js |
| actions/upload-artifact | v3 | Upload build artifacts |
| pnpm/action-setup | v2 | Setup pnpm |
| aws-actions/configure-aws-credentials | v4 | AWS authentication |
| aws-actions/amazon-ecr-login | v2 | ECR login |
| codecov/codecov-action | v3 | Coverage upload |
| 8398a7/action-slack | v3 | Slack notifications |
| snyk/actions/node | master | Snyk security scanning |
| hashicorp/setup-terraform | v3 | Terraform setup |

---

## 📊 OBSERVABILITY & MONITORING

| Ferramenta | Versão | Propósito | Status |
|-----------|--------|----------|--------|
| **CloudWatch** | Latest | Logs centralizados | ✅ Implementado |
| **CloudWatch Logs** | Latest | Log aggregation | ✅ Implementado |
| **CloudWatch Logs Insights** | Latest | Log querying | ⏳ Não configurado |
| **EventBridge** | Latest | Event routing | ✅ Terraform |
| **SNS** | Latest | Alertas e notificações | ✅ Implementado |
| **Slack Webhooks** | Custom | Slack notifications | ✅ CI/CD |
| **Structured Logging** | Custom | JSON logging para análise | ✅ Lambda |

---

## 🔐 SECURITY & AUTHENTICATION

| Tecnologia | Propósito | Status |
|-----------|----------|--------|
| **Firebase Authentication** | OAuth2/OIDC | ✅ Implementado |
| **JWT (jsonwebtoken)** | Token validation | ✅ Auth-service |
| **AWS IAM** | Access control | ✅ Terraform |
| **AWS Secrets Manager** | Secret storage | ✅ Terraform |
| **AWS KMS** | Key management & encryption | ✅ Terraform |
| **GitHub Secrets** | CI/CD secrets | ✅ Implementado |
| **Firestore Security Rules** | Database access control | ✅ Implementado |
| **Storage Rules** | File access control | ✅ Implementado |

---

## 📚 TIPOS & DEFINIÇÕES

| Biblioteca | Versão | Propósito | Status |
|-----------|--------|----------|--------|
| **@types/node** | 20.10.0 | Node.js type definitions | ✅ Implementado |
| **@types/express** | 4.17.21 | Express type definitions | ✅ Auth-service |
| **@types/jest** | 29.5.11 | Jest type definitions | ✅ Implementado |
| **@types/jsonwebtoken** | 9.0.5 | JWT type definitions | ✅ Auth-service |

---

## 🧩 UTILITÁRIOS & HELPERS

| Biblioteca | Versão | Propósito | Status |
|-----------|--------|----------|--------|
| **dotenv** | 16.3.1 | Environment variables | ✅ E2E tests |
| **concurrently** | 8.2.2 | Run multiple commands | ✅ Root package.json |
| **source-map-support** | Latest | Stack trace mapping | ✅ CDK |

---

## 🗺️ CONFIGURATION FILES

| Arquivo | Propósito | Status |
|---------|----------|--------|
| **tsconfig.json** | TypeScript compilation | ✅ Root + per-workspace |
| **jest.config.js** | Jest configuration | ✅ Root + per-workspace |
| **.eslintrc.json** | ESLint rules | ✅ Root + per-workspace |
| **.prettierrc.json** | Prettier formatting | ✅ Root |
| **.npmrc** | NPM configuration | ✅ Root |
| **firebase.json** | Firebase configuration | ✅ Root |
| **firestore.rules** | Firestore security | ✅ Root |
| **firestore.indexes.json** | Firestore indexes | ✅ Root |
| **storage.rules** | Storage security | ✅ Root |
| **cdk.json** | CDK context | ✅ infrastructure/cdk |
| **terraform.tfvars** | Terraform variables | ✅ infrastructure/terraform |

---

## 📈 VERSIONING & STANDARDS

| Padrão | Versão | Status |
|--------|--------|--------|
| **Node.js** | >=18.0.0 | ✅ Implementado |
| **pnpm** | >=8.0.0 | ✅ Implementado |
| **npm** | Latest | ✅ Suportado |
| **TypeScript** | 5.3.3 (strict mode) | ✅ Implementado |
| **ECMAScript** | ES2020+ | ✅ Compilado |

---

## ⏳ TECNOLOGIAS QUE FALTAM ADICIONAR

### 🔴 CRÍTICAS (Necessárias para produção)

#### 1. **API Documentation**
- **Tecnologia:** Swagger/OpenAPI 3.0
- **Propósito:** Documentação automática de APIs
- **Por que falta:** Não há especificação OpenAPI dos endpoints
- **Impacto:** Dificulta integração de clientes
- **Implementação:** 2-4 horas
```bash
Recomendado:
- swagger-ui-express 4.6.3
- @types/swagger-ui-express 4.1.3
```

#### 2. **Rate Limiting & Throttling**
- **Tecnologia:** express-rate-limit
- **Propósito:** Proteção contra DoS e abuso
- **Por que falta:** Não há proteção contra múltiplas requisições
- **Impacto:** Vulnerabilidade de segurança
- **Implementação:** 1-2 horas
```bash
Recomendado:
- express-rate-limit 7.1.5
```

#### 3. **Request Validation Schema**
- **Tecnologia:** Zod ou Joi
- **Propósito:** Validação de entrada em tempo real
- **Por que falta:** Apenas validação manual no Lambda
- **Impacto:** Risco de dados inválidos em produção
- **Implementação:** 3-5 horas
```bash
Recomendado:
- zod 3.22.4 (mais moderno)
ou
- joi 17.11.0 (mais maduro)
```

#### 4. **Distributed Tracing**
- **Tecnologia:** AWS X-Ray ou OpenTelemetry
- **Propósito:** Rastrear requisições entre serviços
- **Por que falta:** Difícil debugar fluxos distribuídos
- **Impacto:** Problemas de observabilidade
- **Implementação:** 4-6 horas
```bash
Recomendado:
- @opentelemetry/api 1.7.0
- @opentelemetry/sdk-node 0.45.0
- @opentelemetry/auto-instrumentations-node 0.41.0
ou
- aws-xray-sdk-core (simpler)
```

#### 5. **Database Migration Tool**
- **Tecnologia:** Firestore migrations ou similar
- **Propósito:** Versionamento e evolução do schema
- **Por que falta:** Sem ferramenta de migração
- **Impacto:** Dificuldade em atualizar schema em produção
- **Implementação:** 3-4 horas
```bash
Recomendado:
- @firebase/database (built-in)
ou criar custom migration system
```

#### 6. **Message Queue System**
- **Tecnologia:** Bull Queue ou AWS SQS consumer
- **Propósito:** Processamento assíncrono de tasks
- **Por que falta:** Não há fila de jobs além do DLQ
- **Impacto:** Tarefas de longa duração podem timeout
- **Implementação:** 4-5 horas
```bash
Recomendado:
- bullmq 4.11.5 (Redis-backed)
ou
- sqs-consumer 6.2.0 (AWS-native)
```

### 🟡 IMPORTANTES (Melhoram qualidade/operacional)

#### 7. **Health Check Standardization**
- **Tecnologia:** @godaddy/terminus ou custom
- **Propósito:** Padronizar health checks
- **Por que falta:** Health checks ad-hoc
- **Impacto:** Inconsistência em liveness/readiness
- **Implementação:** 1-2 horas
```bash
Recomendado:
- @godaddy/terminus 4.11.2
```

#### 8. **Metrics & Monitoring**
- **Tecnologia:** Prometheus ou DataDog
- **Propósito:** Métricas de aplicação em tempo real
- **Por que falta:** Apenas logs no CloudWatch
- **Impacto:** Sem visibilidade de performance
- **Implementação:** 3-4 horas
```bash
Recomendado:
- prom-client 15.0.0 (Prometheus)
ou
- datadog-browser-rum 4.48.2 (DataDog)
```

#### 9. **Service Discovery**
- **Tecnologia:** AWS Service Discovery ou Consul
- **Propósito:** Descoberta de serviços dinâmica
- **Por que falta:** URLs hardcoded
- **Impacto:** Refatoração difícil quando URLs mudam
- **Implementação:** 3-4 horas
```bash
Recomendado:
- Usar AWS Service Discovery nativo
```

#### 10. **Configuration Management**
- **Tecnologia:** etcd, Consul, ou AWS Parameter Store
- **Propósito:** Gerenciar configurações centralizadas
- **Por que falta:** Configurações em .env ou Secrets Manager
- **Impacto:** Sem reloading de configurações em tempo real
- **Implementação:** 2-3 horas
```bash
Recomendado:
- AWS Parameter Store (serverless)
ou
- @aws-sdk/client-ssm 3.490.0
```

#### 11. **Error Tracking & Reporting**
- **Tecnologia:** Sentry ou Rollbar
- **Propósito:** Capturar e rastrear erros
- **Por que falta:** Apenas logs em CloudWatch
- **Impacto:** Erros não notificados proativamente
- **Implementação:** 2-3 horas
```bash
Recomendado:
- @sentry/node 7.91.0
- @sentry/aws-serverless 7.91.0
```

#### 12. **Caching Layer**
- **Tecnologia:** Redis (já em auth-service) ou Memcached
- **Propósito:** Cache distribuído para queries
- **Por que falta:** Apenas Redis local em auth-service
- **Impacto:** Sem cache compartilhado entre instâncias
- **Implementação:** 2-3 horas
```bash
Recomendado:
- ioredis 5.3.2 (já em uso, expandir)
- redis-cache 2.1.0
```

#### 13. **Automated Backups**
- **Tecnologia:** AWS Backup ou custom Lambda
- **Propósito:** Backup automático de dados
- **Por que falta:** Configuração manual em Terraform
- **Impacto:** Risco de perda de dados
- **Implementação:** 2-3 horas (Terraform)
```bash
Recomendado:
- AWS Backup (nativo)
```

#### 14. **Multi-region Deployment**
- **Tecnologia:** AWS Route53 com failover
- **Propósito:** Redundância geográfica
- **Por que falta:** Apenas us-east-1
- **Impacto:** Sem disaster recovery
- **Implementação:** 4-6 horas
```bash
Recomendado:
- Replicar infraestrutura Terraform
- Route53 health checks
```

### 🟢 MELHORIAS (Opcional/Nice-to-have)

#### 15. **Feature Flags**
- **Tecnologia:** LaunchDarkly ou custom
- **Propósito:** Controlar features em tempo real
- **Por que falta:** Sem sistema de feature flags
- **Impacto:** Deploy = release imediato
- **Implementação:** 2-3 horas
```bash
Recomendado:
- ldclient-js 7.6.0 (LaunchDarkly)
```

#### 16. **GraphQL API**
- **Tecnologia:** Apollo Server
- **Propósito:** API mais eficiente
- **Por que falta:** APIs REST apenas
- **Impacto:** Over-fetching de dados
- **Implementação:** 5-7 horas
```bash
Recomendado:
- apollo-server-express 4.10.1
```

#### 17. **WebSocket Support**
- **Tecnologia:** Socket.io ou ws
- **Propósito:** Real-time updates
- **Por que falta:** Polling apenas
- **Impacto:** Latência em atualizações
- **Implementação:** 3-4 horas
```bash
Recomendado:
- socket.io 4.7.2
```

#### 18. **gRPC Support**
- **Tecnologia:** gRPC-js
- **Propósito:** Comunicação entre serviços eficiente
- **Por que falta:** HTTP/REST apenas
- **Impacto:** Performance entre serviços
- **Implementação:** 4-5 horas
```bash
Recomendado:
- @grpc/grpc-js 1.9.14
```

#### 19. **Performance Testing**
- **Tecnologia:** Apache JMeter ou k6
- **Propósito:** Testes de carga e stress
- **Por que falta:** Sem testes de performance
- **Impacto:** Surpresas em produção
- **Implementação:** 3-4 horas
```bash
Recomendado:
- k6 0.48.0 (JavaScript)
```

#### 20. **Chaos Engineering**
- **Tecnologia:** Gremlin ou AWS FIS
- **Propósito:** Teste de resiliência
- **Por que falta:** Sem testes de caos
- **Impacto:** Sem preparação para falhas
- **Implementação:** 4-6 horas
```bash
Recomendado:
- AWS Fault Injection Simulator
```

---

## 📊 MATRIX DE PRIORIDADES

```
PRIORIDADE | TECNOLOGIA | ESFORÇO | IMPACTO | STATUS
-----------|-----------|---------|---------|--------
CRÍTICA    | API Docs   | 2-4h    | Alto    | ⏳ TODO
CRÍTICA    | Rate Limit | 1-2h    | Alto    | ⏳ TODO
CRÍTICA    | Validation | 3-5h    | Alto    | ⏳ TODO
CRÍTICA    | Tracing    | 4-6h    | Alto    | ⏳ TODO
CRÍTICA    | Migration  | 3-4h    | Alto    | ⏳ TODO
CRÍTICA    | Queue      | 4-5h    | Alto    | ⏳ TODO

IMPORTANTE | Health     | 1-2h    | Médio   | ⏳ TODO
IMPORTANTE | Metrics    | 3-4h    | Médio   | ⏳ TODO
IMPORTANTE | Discovery  | 3-4h    | Médio   | ⏳ TODO
IMPORTANTE | Config     | 2-3h    | Médio   | ⏳ TODO
IMPORTANTE | Error Trk  | 2-3h    | Médio   | ⏳ TODO
IMPORTANTE | Caching    | 2-3h    | Médio   | ⏳ TODO
IMPORTANTE | Backups    | 2-3h    | Médio   | ⏳ TODO
IMPORTANTE | Multi-reg  | 4-6h    | Alto    | ⏳ TODO

NICE-TO-HAVE | Features  | 2-3h    | Baixo   | ⏳ TODO
NICE-TO-HAVE | GraphQL   | 5-7h    | Baixo   | ⏳ TODO
NICE-TO-HAVE | WebSocket | 3-4h    | Baixo   | ⏳ TODO
NICE-TO-HAVE | gRPC      | 4-5h    | Baixo   | ⏳ TODO
NICE-TO-HAVE | Perf Test | 3-4h    | Médio   | ⏳ TODO
NICE-TO-HAVE | Chaos     | 4-6h    | Médio   | ⏳ TODO
```

---

## 🎯 RECOMENDAÇÕES

### Fase 2 (Próximas 2 semanas)
**Implementar em ordem:**
1. ✅ API Documentation (Swagger)
2. ✅ Rate Limiting
3. ✅ Request Validation (Zod)
4. ✅ Distributed Tracing (OpenTelemetry)
5. ✅ Message Queues (Bull ou SQS Consumer)

**Tempo estimado:** 14-22 horas

### Fase 3 (Mês 2)
6. ✅ Health Check Standardization
7. ✅ Metrics & Monitoring
8. ✅ Error Tracking (Sentry)
9. ✅ Service Discovery
10. ✅ Configuration Management

**Tempo estimado:** 12-17 horas

### Fase 4 (Mês 3)
11. ✅ Multi-region Deployment
12. ✅ Automated Backups
13. ✅ Performance Testing
14. ✅ Chaos Engineering
15. ✅ WebSocket/gRPC (se necessário)

**Tempo estimado:** 16-24 horas

---

## 📊 STACK SUMMARY

```
┌─────────────────────────────────────────────┐
│          CURRENT TECH STACK (42)            │
├─────────────────────────────────────────────┤
│ ✅ Languages: 6 (TypeScript, Node, Bash...)  │
│ ✅ Databases: 3 (Firestore, Redis, CF)       │
│ ✅ Cloud: 17 AWS Services                    │
│ ✅ Testing: 4 Frameworks                     │
│ ✅ CI/CD: GitHub Actions + 8 actions         │
│ ✅ Security: Firebase + AWS IAM              │
│ ✅ Monitoring: CloudWatch + SNS              │
│ ✅ IaC: CDK + Terraform                      │
│ ✅ Containerization: Docker + Alpine         │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│    MISSING TECH STACK (20+)                 │
├─────────────────────────────────────────────┤
│ 🔴 CRÍTICAS: 6 (API Docs, Rate Limit...)    │
│ 🟡 IMPORTANTES: 8 (Health, Metrics...)      │
│ 🟢 NICE-TO-HAVE: 6 (GraphQL, WebSocket...)  │
└─────────────────────────────────────────────┘

TOTAL EFFORT: ~45-70 horas
TIMELINE: 6-10 semanas (parallelizable)
```

---

**Last Updated:** January 27, 2026  
**Owner:** T3CK Core Team  
**Next Review:** February 3, 2026
