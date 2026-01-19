# Arquitetura da Plataforma T3CK

## Visão Geral

A plataforma T3CK é uma solução multi-tenant escalável construída na AWS, projetada para suportar 60+ implantações por ano.

## Componentes Principais

### Infraestrutura

- **Terraform**: Recursos base (VPC, networking, security groups, IAM, S3)
- **AWS CDK**: Recursos complexos (ECS, ALB, Lambda, EventBridge, API Gateway)
- **ECS Fargate**: Containerização dos serviços
- **Application Load Balancer**: Roteamento e balanceamento de carga
- **EventBridge**: Sistema de eventos centralizado

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
4. Execução CDK (recursos específicos)
5. Criação Firebase project + Firestore
6. Configuração Route53
7. Deploy containers Docker
8. Geração chaves de API
9. Health checks finais

**Meta**: < 10 minutos

## Segurança

- **Autenticação**: Firebase Auth + AWS Cognito (híbrido)
- **Criptografia**: AWS KMS para dados sensíveis
- **Rate Limiting**: Redis + API Gateway
- **Proteção**: AWS WAF, validação de tokens, session management

## Observabilidade

- **CloudWatch**: Logs e métricas
- **Dashboards**: Uptime, erros 5xx, tempo de resposta
- **Alertas**: SNS + Email/Slack
- **X-Ray**: Tracing distribuído (futuro)

## CI/CD

- **GitHub Actions**: Pipeline automatizado
- **Staging**: Deploy automático em `develop`
- **Production**: Deploy manual com aprovação
- **Quality Gates**: Coverage mínimo 80%, security scanning
