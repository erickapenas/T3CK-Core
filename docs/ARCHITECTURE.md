# Arquitetura da Plataforma T3CK

## Visão Geral

A plataforma T3CK é uma solução multi-tenant escalável construída no Google Cloud Platform, projetada para suportar 60+ implantações por ano.

## Componentes Principais

### Infraestrutura

- **Cloud Run**: Runtime principal para microserviços HTTP
- **Artifact Registry**: Registro de imagens Docker
- **Cloud Build**: Build e publicação das imagens
- **Cloud Load Balancing**: Entrada HTTPS e distribuição de tráfego
- **Cloud Armor**: Proteção WAF e rate limiting de borda
- **Cloud Scheduler / Pub/Sub / Workflows**: Orquestração e agendamento
- **Cloud SQL**: Persistência relacional gerenciada
- **Memorystore for Redis**: Cache, filas e rate limiting distribuído

### Serviços

1. **Auth Service** (`services/auth-service`)
   - Autenticação OAuth2/OIDC
   - Criptografia com AWS KMS
   - Rate limiting
   - Proteção contra fraudes

2. **Webhook Service** (`services/webhook-service`)
   - Gerenciamento de webhooks
   - Retry logic
   - Dead letter queue
   - Logs de entregas

3. **Tenant Service** (`services/tenant-service`)
   - Validação de formulários de provisionamento
   - State machine de provisionamento
   - Gerenciamento de tenants

### SDK

- **@t3ck/sdk**: SDK interno NPM
- Operações simplificadas para cart, catalog, checkout, settings
- Retry automático e error handling

## Fluxo de Provisionamento

1. Formulário submetido via CRM
2. Validação obrigatória
3. Execução Terraform (recursos base)
4. Build de imagens via Cloud Build
5. Deploy dos serviços no Cloud Run
6. Configuração de domínio, HTTPS e balanceamento no GCP
7. Provisionamento de Cloud SQL / Memorystore / Secret Manager
8. Geração de chaves de API e segredos gerenciados
9. Health checks finais

**Meta**: < 10 minutos

## Segurança

- **Autenticação**: Firebase Auth + identidade federada/OIDC quando necessário
- **Criptografia**: Google Cloud KMS para dados sensíveis
- **Rate Limiting**: Redis gerenciado + API Gateway / Cloud Armor
- **Proteção**: Cloud Armor, validação de tokens, session management, Secret Manager

## Observabilidade

- **Cloud Logging / Cloud Monitoring**: Logs e métricas
- **Dashboards**: Uptime, erros 5xx, tempo de resposta
- **Alertas**: Alerting do GCP + Email/Slack
- **Tracing**: OpenTelemetry + Cloud Trace

## CI/CD

- **GitHub Actions**: Pipeline automatizado
- **Staging**: Deploy automático em `develop`
- **Production**: Deploy manual com aprovação
- **Quality Gates**: Coverage mínimo 80%, security scanning
