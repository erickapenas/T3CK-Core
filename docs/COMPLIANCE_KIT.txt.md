# T3CK Core — Compliance Kit

## 1. Objetivo

Este kit consolida evidências e artefatos de compliance observáveis no repositório do projeto **T3CK Core**. Ele foi montado com base em documentação e configuração existentes no código-fonte, sem validar ambiente produtivo externo.

## 2. Escopo

Cobertura deste kit:

- segurança da aplicação e da API
- gestão de segredos e credenciais
- proteção de dados e isolamento multi-tenant
- CI/CD e trilha de auditoria
- backup, observabilidade e resposta operacional
- lacunas para auditoria formal

Fora do escopo deste kit:

- validação em contas GCP/GCP/Firebase reais
- revisão jurídica formal
- certificações de terceira parte
- evidências operacionais fora do repositório

## 3. Resumo executivo

Com base no repositório, o projeto apresenta sinais de maturidade relevante para controles de segurança e operação:

- arquitetura multi-tenant documentada
- CI/CD com quality gates, scanning e aprovação manual para produção
- controles declarados para autenticação, rate limiting, WAF, secrets e criptografia
- regras Firestore com isolamento por tenant
- documentação de backup, monitoramento, métricas e error tracking

Ao mesmo tempo, o repositório também mostra lacunas ou pontos ainda parciais em algumas frentes de compliance:

- divergência entre README e LICENSE sobre regime de licenciamento
- itens de observabilidade, alertas, retenção e DR marcados como parciais ou pendentes em checklist interno
- ausência, nesta revisão, de comprovação operacional de execução real dos controles em produção

## 4. Perfil do sistema

- Nome: Motor T3CK / T3CK Core
- Tipo: plataforma e-commerce SaaS multi-tenant com 60+ deployments/ano
- Stack principal: Node.js 18+, TypeScript, pnpm 8+ workspaces
- Cloud principal: GCP (Cloud Run, Cloud SQL, Memorystore, Storage, KMS, Secret Manager)
- Dados e identidade: Firebase (Firestore/Auth/Storage) com integração AWS Cognito documentada
- Deploy: Cloud Run + Blue-Green com rollback automático
- IaC: Terraform + AWS CDK (legado sendo descontinuado)
- CI/CD: GitHub Actions com quality gates automatizadas
- Banco de dados: Cloud SQL MySQL + Firestore + Redis
- Microserviços: 13 serviços independentes com isolamento de tenant

## 5. Mapeamento de controles

### 5.1 Governança e SDLC

Controles identificados:

- repositório Git com workflows de CI/CD
- lint, format, type-check e testes automatizados
- cobertura mínima de 80%
- aprovação manual para produção
- artefatos e documentação de deployment e rollback

Evidências:

- `README.md`
- `.github/workflows/ci-cd.yml`
- `.github/workflows/quality.yml`
- `docs/DEPLOYMENT.md`

Leitura de compliance:

- existe trilha de mudança e gate técnico antes de deploy
- o workflow de produção depende de environment `production`, favorecendo segregação e aprovação

### 5.2 Gestão de acesso, autenticação e autorização

Controles identificados:

- autenticação híbrida Firebase Auth + Cognito documentada
- JWT com RS256 e rotação de chaves documentada
- MFA documentado
- API keys internas para endpoints sensíveis
- sessões e revogação documentadas

Evidências:

- `README.md`
- `docs/ARCHITECTURE.md`
- `docs/API.md`
- `CHECKLIST_PRODUCTION_READINESS.md`

Leitura de compliance:

- o desenho cobre autenticação forte e lifecycle de credenciais
- falta, neste kit, prova operacional de rotação efetiva, MFA habilitado em produção e revisões periódicas de acesso

### 5.3 Segredos e criptografia

Controles identificados:

- uso documentado de GCP Secrets Manager e KMS
- backend Terraform com S3 criptografado e KMS
- rotação de credenciais a cada 90 dias documentada
- sanitização de headers sensíveis na integração Sentry documentada

Evidências:

- `CHECKLIST_PRODUCTION_READINESS.md`
- `.github/SECRETS.md`
- `docs/INFRASTRUCTURE_IaC.md`
- `docs/ERROR_TRACKING_IMPLEMENTATION.md`

Leitura de compliance:

- o desenho está alinhado com boas práticas de secret management
- há risco de auditoria por existir `.env` no diretório do projeto; este kit não inspecionou o conteúdo do arquivo para evitar exposição de segredo

### 5.4 Segurança de aplicação e API

Controles identificados:

- CORS, CSRF, headers de segurança, rate limiting e validação de input documentados
- proteção WAF documentada com managed rules, rate limiting e geo-blocking
- testes de segurança e dependências no `package.json` e workflows
- varredura Snyk e `pnpm audit --audit-level=high`

Evidências:

- `docs/API.md`
- `package.json`
- `.github/workflows/quality.yml`
- `docs/INFRASTRUCTURE_IaC.md`
- `CHECKLIST_PRODUCTION_READINESS.md`

Leitura de compliance:

- há um conjunto coerente de controles preventivos e detectivos
- a execução real de pentests, auditorias SAST e gestão contínua de findings precisa de evidência adicional fora do repositório

### 5.5 Proteção de dados e isolamento multi-tenant

Controles identificados:

- regras Firestore restringem leitura/escrita por `tenant_id`
- operações administrativas exigem papéis elevados
- `audit_logs` são imutáveis para update/delete
- tenant isolation é documentado em múltiplos serviços

Evidências:

- `firestore.rules`
- `docs/API.md`
- `docs/ARCHITECTURE.md`

Leitura de compliance:

- há evidência concreta de isolamento lógico por tenant no nível de regras Firestore
- ainda falta comprovação de classificação formal de dados, matriz de acesso e política publicada de retenção/descarte

### 5.6 Backup, continuidade e recuperação

Controles identificados:

- estratégia documentada para backup de Firestore e Redis
- execução agendada e monitorada documentada
- rollback de produção documentado
- runbooks referenciados em documentação de deploy

Evidências:

- `docs/BACKUPS_IMPLEMENTATION_COMPREHENSIVE.md`
- `docs/DEPLOYMENT.md`
- `.github/workflows/backup-runner.yml` (existência observada)

Leitura de compliance:

- o projeto demonstra preocupação com backup e recuperação
- testes regulares de restauração e plano formal de DR ainda aparecem como lacuna parcial em documentação interna

### 5.7 Logging, monitoramento e resposta a incidentes

Controles identificados:

- Prometheus e endpoint `/metrics`
- documentação de dashboards e alertas
- error tracking com Sentry documentado
- CloudWatch e notificações Slack documentadas
- Cloud Logging centralizado com audit trails
- métricas de uptime, latência e taxa de erro

Evidências:

- `docs/METRICS_MONITORING_IMPLEMENTATION.md`
- `docs/ERROR_TRACKING_IMPLEMENTATION.md`
- `docs/DEPLOYMENT.md`
- `docs/ARCHITECTURE.md`
- `CHECKLIST_PRODUCTION_READINESS.md`

Leitura de compliance:

- boa base para observabilidade e resposta
- checklist interno ainda indica lacunas em retenção de logs, dashboards Grafana, regras de alerta avançadas e análise de tracing distribuído

### 5.8 Gerenciamento de vulnerabilidades e testes de segurança

Controles identificados:

- Snyk scanning automatizado em CI/CD
- `pnpm audit --audit-level=high` em quality gates
- linting automático com ESLint
- type checking obrigatório com TypeScript
- testes mínimos 80% coverage
- script de pentest disponível no repositório
- OWASP ASVS alinhado com testes específicos

Evidências:

- `.github/workflows/quality.yml` com Snyk integration
- `package.json` com scripts de audit e pentest
- `docs/SECURITY.md` referencia OWASP Top 10
- `CHECKLIST_PRODUCTION_READINESS.md` marca segurança validada

Leitura de compliance:

- há scanning de dependências contínuo
- falta ainda: relatório consolidado de vulnerabilidades, SLA formal de remediação, pentest recorrente com laudo formal e evidência de correção

### 5.9 Conformidade legal e contratual

Controles identificados:

- política de retenção e descarte de dados documentada
- política de secrets documentada
- segredos centralizados em Secret Manager e KMS
- rotação de credenciais a cada 90 dias
- isolamento de tenant em múltiplos níveis
- audit logs imutáveis para operações críticas

Evidências:

- `docs/DATA_RETENTION_AND_DISPOSAL_POLICY.md` (novo)
- `docs/SECRETS_POLICY.md` (novo)
- `.github/SECRETS.md`
- `firestore.rules` com `audit_logs` imutáveis
- `docs/INFRASTRUCTURE_IaC.md`

Leitura de compliance:

- há política de retenção articulada
- falta ainda: inventário de dados pessoais por tipo, mapa de processamento LGPD, base legal por uso, contatos de DPO/atendimento ao titular, comprovação de consentimento

### 5.10 Backup, continuidade e recuperação

Controles identificados:

- estratégia documentada para backup de Firestore, Redis e Cloud SQL
- execução agendada e monitorada com alertas
- rollback de produção documentado com smoke tests
- runbooks de operação referenciados
- retenção de backup por 365 dias com lifecycle rules
- criptografia de backup em repouso e em trânsito

Evidências:

- `docs/BACKUPS_IMPLEMENTATION_COMPREHENSIVE.md`
- `docs/DEPLOYMENT.md` com zerodowntime e rollback
- `.github/workflows/backup-runner.yml`
- `docs/INFRASTRUCTURE_IaC.md` com storage encryption
- `CHECKLIST_PRODUCTION_READINESS.md` marca backups validados

Leitura de compliance:

- o projeto demonstra preocupação estruturada com backup e recuperação
- falta ainda: testes periódicos de restauração com evidência, plano formal de DR (RTO/RPO) com testes, runbooks de incidente documentados e validados, métricas de sucesso de backup e restore

## 6. Mapeamento resumido por framework

### LGPD - Lei Geral de Proteção de Dados

Parcialmente suportado por evidências do repositório:

- isolamento por tenant com regras Firestore (`tenant_id`)
- controles de acesso por função (admin, user, guest)
- criptografia de dados pessoais e key management documentados
- exportação/offboarding de tenant com política de retenção
- trilhas de auditoria em operações de dados críticas
- política de retenção e descarte articulada

Pendências para fechamento de kit LGPD:

1. **Inventário de dados pessoais**: categorizar por tipo (identificadores, contato, dados de pagamento, comportamento)
2. **Base legal e finalidade**: documento mapeando cada processamento à base legal (consentimento, execução de contrato, obrigação legal, etc.)
3. **Política de retenção aprovada**: formalizar tempos de retenção por categoria e contexto
4. **Fluxo de atendimento a titulares**: acesso, retificação, exclusão, portabilidade com processo formal
5. **Registro formal de incidentes**: template e procedimento de notificação a titulares e autoridades
6. **DPA com subprocessadores**: contratos com GCP, AWS Cognito e third-party integration providers
7. **Privacy by design**: evidência de Privacy Impact Assessment (PIA)

### ISO 27001 / ISMS - Information Security Management System

Bem suportado no plano técnico, mas incompleto como evidência de certificação:

- gestão de acesso com JWT RS256 e MFA documentados
- CI/CD hardening com quality gates e aprovação manual
- backup e recuperação documentados com política de retenção
- monitoramento e logging centralizado com Cloud Logging
- segregação staging/produção com rollback automático
- Firestore security rules com isolamento por tenant

Pendências para certificação formal:

1. **Políticas formais aprovadas**: documentos de direcionamento (Information Security Policy)
2. **Registro de riscos**: Risk Register com avaliação de probabilidade/impacto
3. **Revisão periódica de acessos**: evidência de quarterly/annual access review
4. **Treinamento de segurança**: programa de awareness para equipe
5. **Gestão de fornecedores**: vendor management process com segurança na contratação
6. **Gestão de mudanças formal**: change control board e processo de aprovação
7. **Testes de continuidade**: disaster recovery drills com evidência e lições aprendidas

### OWASP ASVS v4.0 / OWASP Top 10 2021

Bem alinhado por documentação e testes declarados:

- **V2 - Autenticação**: JWT RS256, MFA, token rotation, session management
- **V3 - Sessão**: revogação de tokens, logout documentados
- **V4 - Validação**: Zod schemas em todas as APIs
- **V5 - Proteção contra XSS**: Helmet.js, CSP headers
- **V6 - Proteção de acesso**: RBAC com tenant isolation
- **V7 - Proteção contra CSRF**: CSRF tokens, SameSite cookies
- **V9 - Comunicação**: TLS/HTTPS obrigatório, rate limiting
- **V10 - Tratamento de dados**: criptografia AES-256-GCM, no-store headers
- **V11 - Proteção contra negócios lógicos**: validação de fluxos de order/payment
- **V12 - Gerenciamento de arquivo**: sanitização de upload, content-type validation
- **V14 - Configuração**: segredos em Secret Manager, não em código

Pendências:

1. **Relatório consolidado de testes**: SAST, DAST, dependency scan com findings trackados
2. **Vulnerabilidade de negócios lógicos**: teste de race conditions, transaction atomicity
3. **Teste de integração segura**: webhook HMAC validation, rate limiting de endpoints sensíveis
4. **Evidência de correção**: findings críticos closed dentro de SLA definido

### PCI DSS - Payment Card Industry Data Security Standard

Relevante apenas se há armazenamento/processamento de dados de cartão:

- **Escopo PCI completo não identificado no repositório**
- há menção a tokenização e "no PAN storage" no checklist
- webhook signing e logs imutáveis presentes
- há proteção contra ataques de força bruta e card-testing

Pendências críticas para alegação formal de operação PCI-compliant:

1. **Diagrama CDE**: Card Data Environment formal
2. **Escopo PCI declarado**: dados de cartão tratados internamente ou apenas via tokenização (escopea de fora do PCI)
3. **Evidência de não armazenamento de PAN**: alertas em logs/banco/backups, sanitização de error messages
4. **ASV scans**: Approved Scanning Vendor external scans (trimestral ou em mudanças significativas)
5. **Pentests formais**: anuais com correção de finding de negócios lógicos
6. **Evidência do adquirente/gateway**: certificado de conformidade do processador usado
7. **Política de retenção de dados de cartão**: conforme PCI v3.2.1 (máx 6 meses/requisição explicita de manutenção)

**Nota**: Se o T3CK trata somente com tokenização (e.g., AbacatePay, Pix), o escopo PCI pode ser reduzido. Isso requer validação com o adquirente/gateway utilizado.

## 7. Riscos e lacunas identificados

1. **Conflito de licenciamento**
   - `README.md` indica licença MIT
   - `LICENSE` afirma software proprietário e confidencial
   - Isso precisa ser resolvido antes de qualquer due diligence ou kit externo

2. **Segredos locais presentes no projeto**
   - existe arquivo `.env` no diretório raiz
   - requer validação de que não está versionado indevidamente e de que segue política de segredo

3. **Controles ainda parciais em documentação interna**
   - retenção de logs
   - dashboards Grafana e alertas
   - disaster recovery e restore testing
   - SAST/SonarQube/deployment hardening adicionais

4. **Ausência de evidência operacional**
   - este kit é baseado em repositório
   - ainda faltam prints, exports, relatórios de execução e aprovações formais para auditoria externa

## 8. Evidências principais

- `README.md`
- `package.json`
- `firestore.rules`
- `.github/workflows/ci-cd.yml`
- `.github/workflows/quality.yml`
- `.github/SECRETS.md`
- `docs/ARCHITECTURE.md`
- `docs/API.md`
- `docs/DEPLOYMENT.md`
- `docs/INFRASTRUCTURE_IaC.md`
- `docs/BACKUPS_IMPLEMENTATION_COMPREHENSIVE.md`
- `docs/METRICS_MONITORING_IMPLEMENTATION.md`
- `docs/ERROR_TRACKING_IMPLEMENTATION.md`
- `CHECKLIST_PRODUCTION_READINESS.md`

## 9. Status de prontidão de compliance

Classificação deste kit, com base apenas no repositório:

- **Compliance técnico documental**: médio/alto
- **Compliance operacional auditável**: médio
- **Compliance regulatório formal**: parcial

## 10. Próximas ações recomendadas

Prioridade alta:

1. corrigir conflito entre `README.md` e `LICENSE`
2. revisar política de segredos e confirmar tratamento do `.env`
3. consolidar política de retenção de logs, backup e descarte de dados
4. gerar evidências operacionais reais de CI/CD, backups, alertas e restore tests

Prioridade média: 5. publicar matriz de acesso e revisão periódica 6. consolidar inventário de dados pessoais e mapa LGPD 7. formalizar runbooks de incidente, DR e restore com evidência de teste 8. consolidar relatório de testes de segurança e vulnerabilidades

Prioridade baixa: 9. criar pacote executivo para auditoria externa 10. criar checklist anual de revisão de compliance

## 11. Declaração de limitação

Este documento não certifica conformidade legal ou regulatória. Ele apenas organiza evidências técnicas visíveis no repositório e destaca lacunas para validação formal.
