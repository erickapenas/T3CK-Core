# T3CK Core — Risk Register

## Visão geral

Este Risk Register consolida riscos identificados na arquitetura, operação e compliance do T3CK Core, com avaliação de impacto, probabilidade e plano de mitigação.

**Última atualização**: 2026-04-06
**Próxima revisão**: Trimestral

---

## Escala de avaliação

### Probabilidade
| Nível | Descrição | Frequência esperada |
|---|---|---|
| Raro | Poderia ocorrer mas improvável | < 1 vez ao ano |
| Baixo | Pode ocorrer ocasionalmente | 1-2 vezes ao ano |
| Médio | Provável de ocorrer | 3-5 vezes ao ano |
| Alto | Muito provável | > 5 vezes ao ano |

### Impacto
| Nível | Descrição | Efeito |
|---|---|---|
| Crítico | Falha completa de serviço, exposição de dados sensíveis | Downtime > 2h, perda de dados pessoais |
| Alto | Degradação significativa, exposição limitada | Downtime 30-120min, dados de algumas contas expostos |
| Médio | Degradação menor, impacto operacional | Downtime < 30min, funcionalidade reduzida |
| Baixo | Impacto operacional mínimo | Sem downtime observável |

### Matrize de Risco
| | Raro | Baixo | Médio | Alto |
|---|---|---|---|---|
| **Crítico** | Alto | Crítico | Crítico | Crítico |
| **Alto** | Médio | Alto | Crítico | Crítico |
| **Médio** | Baixo | Médio | Alto | Crítico |
| **Baixo** | Baixo | Baixo | Médio | Alto |

---

## Registro de riscos

### ID 001 - Data Breach / Vazamento de dados de tenant

**Categoria**: Segurança de dados
**Risco**: Acesso não autorizado a dados de um ou mais tenants através de vulnerabilidade em API, firestore rules ou misconfiguration
**Probabilidade**: Médio
**Impacto**: Crítico
**Nível de risco**: **CRÍTICO**

**Mitigation controls**:
- Firestore security rules com isolamento por tenant_id (regras concretas em produção)
- Field-level encryption para dados sensíveis (implementado AES-256-GCM)
- API validation com Zod em todos endpoints
- Rate limiting com Redis-backed throttling
- Cloud Armor com WAF managed rules
- Testes de segurança em CI/CD (Snyk)
- Audit logs imutáveis para acesso a dados críticos

**Ações adicionais**:
- [ ] Teste de penetración anual com laudo formal
- [ ] Teste de isolamento de tenant em suite de testes e2e
- [ ] DAST (Dynamic Application Security Testing) integrado a CI/CD
- [ ] Validação trimestral de firestore rules

**Owner**: Security Team / Arquitetura
**Status**: Mitigado (parcial), requer validação operacional

---

### ID 002 - Falha de backup / Impossibilidade de recover

**Categoria**: Continuidade de negócio
**Risco**: Backup corrompido, inacessível ou excluído impedindo recuperação de dados em caso de incidente
**Probabilidade**: Baixo
**Impacto**: Crítico
**Nível de risco**: **ALTO**

**Mitigation controls**:
- Backup automatizado de Firestore, Redis e Cloud SQL documentado
- Retenção de 365 dias com lifecycle rules
- Criptografia de backup em repouso e em trânsito
- Versionamento para GCS buckets
- Monitoramento de backup com alertas CloudWatch
- Política de retenção formalizada

**Ações adicionais**:
- [ ] Teste de restauração mensal com documentação
- [ ] Cronograma de restore drill trimestral com validação funcional
- [ ] Simulação de disaster recovery anual
- [ ] Métricas de RTO/RPO por serviço formalizado
- [ ] Automação de restore test em staging

**Owner**: DevOps / Plataforma
**Status**: Parcialmente implementado, requer evidência operacional

---

### ID 003 - Exposição de secrets / Credenciais comprometidas

**Categoria**: Segurança de credenciais
**Risco**: Segredos (API keys, DB credentials, webhook secrets) expostos em código, logs ou histórico git
**Probabilidade**: Médio
**Impacto**: Crítico
**Nível de risco**: **CRÍTICO**

**Mitigation controls**:
- Secrets centralizados em Google Secret Manager
- Rotação de credenciais a cada 90 dias documentada
- .gitignore com padrões de exclusão (.env, .pem, .key)
- Masked secrets em logs via ERROR_TRACKING_IMPLEMENTATION
- Sanitização de headers sensíveis (Authorization, Cookie, X-API-Key)
- Pre-commit hooks para detecção de secrets (pode ser implementado)
- Git history clean (sem secrets versionados)

**Ações adicionais**:
- [ ] Implementar pre-commit hook com detect-secrets ou truffleHog
- [ ] Audit de histórico git com ferramenta de varredura de secrets
- [ ] Rotação imediata se secret exposto for detectado
- [ ] Treinar equipe sobre secret management
- [ ] Documentar procedimento de incidente de secret exposto
- [ ] Validar que .env local nunca foi commitado

**Owner**: Security / DevOps
**Status**: Mitigado documentalmente, requer automação adicional

---

### ID 004 - Denúncia de retenção de dados pessoais / LGPD violation

**Categoria**: Compliance regulatório
**Risco**: Retenção de dados pessoais além do formalizado ou sem base legal apropriada, levando a autuação LGPD
**Probabilidade**: Médio
**Impacto**: Alto
**Nível de risco**: **ALTO**

**Mitigation controls**:
- Política de retenção de dados documentada (90-180 dias logs, 365 dias backups)
- Expiração automática de exportações de tenant (30 dias)
- Audit logs imutáveis de remoção/purga de dados
- Firestore security rules com tenant isolation
- Descarte de dados em offboarding documentado

**Ações adicionais**:
- [ ] Criar inventário formal de dados pessoais (identificadores, contato, pagamento, comportamento)
- [ ] Mapear base legal de cada tipo de processamento (consentimento, execução contrato, obrigação legal)
- [ ] Formalizar tempo de retenção por categoria e contexto
- [ ] Criar DPA com subprocessadores (GCP, AWS Cognito)
- [ ] Documentar fluxo de atendimento a titulares (acesso, retificação, exclusão, portabilidade)
- [ ] Validar consentimento e cookie banner

**Owner**: Legal / Compliance / Arquitetura
**Status**: Parcialmente documentado, requer formalização legal

---

### ID 005 - Incapacidade de detectar/responder a incidente de segurança

**Categoria**: Resposta a incidentes
**Risco**: Falta de alertas, playbooks ou equipe preparada levando a resposta lenta ou inapropriada a incidente
**Probabilidade**: Baixo
**Impacto**: Alto
**Nível de risco**: **ALTO**

**Mitigation controls**:
- Cloud Logging centralizado com audit trails
- Error tracking com Sentry
- Metrics e dashboards com Prometheus/Grafana
- Notificações Slack de eventos críticos (pode estar completo)
- Health checks em todos serviços

**Ações adicionais**:
- [ ] Criar Incident Response Plan formal com playbooks
- [ ] Definir escalation paths e owners por tipo de incidente
- [ ] Documentar SLA de resposta por severidade
- [ ] Treinar equipe em incident management
- [ ] Simulação trimestral de incident response
- [ ] Template de post-mortem e lições aprendidas

**Owner**: DevOps / Platform / Security
**Status**: Infra em lugar, documentação de processo faltando

---

### ID 006 - Falha de autenticação / MFA não enforced em produção

**Categoria**: Controle de acesso
**Risco**: Acesso não autorizado a conta admin ou tenant sensível por falha de MFA ou token management
**Probabilidade**: Baixo
**Impacto**: Crítico
**Nível de risco**: **ALTO**

**Mitigation controls**:
- JWT RS256 implementado em API Gateway
- MFA documentado em Firebase Auth
- Token rotation documentado
- Session management e revocation documentados

**Ações adicionais**:
- [ ] Validar MFA é enforced para admin em produção
- [ ] Implement grace period de logout (token revocation verificado)
- [ ] Audit log de falhas de autenticação
- [ ] Rate limiting em endpoints de login
- [ ] Validar Firebase Auth MFA settings em produção
- [ ] Teste anual de bypass de token

**Owner**: Security / Auth Team
**Status**: Documentado, requer validação operacional

---

### ID 007 - Falha de CI/CD pipeline permitindo código malicioso

**Categoria**: SDLC / Build security
**Risco**: Quality gate inefetivo permitindo código inseguro, código sem testes ou dependência vulnerável ser deployado
**Probabilidade**: Baixo
**Impacto**: Crítico
**Nível de risco**: **ALTO**

**Mitigation controls**:
- ESLint + Prettier automatizado em CI
- TypeScript type checking obrigatório
- Testes mínimos 80% coverage
- Snyk dependency scanning
- Manual approval para produção
- Smoke tests pós-deploy com rollback automático

**Ações adicionais**:
- [ ] Adicionar SAST (SonarQube ou similar) ao pipeline
- [ ] Validar que branch protection rules estão ativas
- [ ] Requer 1+ aprovação de code review
- [ ] Validar que manual approval workflow funciona
- [ ] Teste anual de segurança do pipeline
- [ ] Audit trail de todas aprovações de deploy

**Owner**: Architecture / DevOps
**Status**: Bem estruturado, validação anual recomendada

---

### ID 008 - Vendor lock-in com GCP / Falta de multi-cloud

**Categoria**: Risco operacional
**Risco**: Dependência total de GCP impedindo migration, negociação de preço ou seleção alternativa
**Probabilidade**: Médio
**Impacto**: Médio
**Nível de risco**: **MÉDIO**

**Mitigation controls**:
- IaC com Terraform (portável entre clouds)
- Containerização com Docker
- Aplicação agnóstica a cloud (Node.js + APIs standard)
- AWS CDK como backup alternativo (em descontinuação)

**Ações adicionais**:
- [ ] Documentar strategy de portabilidade
- [ ] Manter AWS CDK atualizado como opção alternativa
- [ ] Avaliar custo-benefício de multi-cloud
- [ ] Regional redundância dentro de GCP ao invés de multi-cloud se não houver business case

**Owner**: Arquitetura
**Status**: Mitigado com IaC, sem urgent action

---

### ID 009 - Falta de testes de segurança / Pentest não realizado

**Categoria**: Segurança de aplicação
**Risco**: Vulnerabilidades lógicas de negócio, race conditions ou fluxos de pagamento não detectados
**Probabilidade**: Médio
**Impacto**: Alto
**Nível de risco**: **ALTO**

**Mitigation controls**:
- Snyk scanning de dependências
- OWASP ASVS testes declarados
- Script de pentest presente no repositório

**Ações adicionais**:
- [ ] Agendarpentest anual formal com laudo (Q2 ou Q3)
- [ ] Incluir testes de negócios lógicos (race conditions de order, double-charge prevention)
- [ ] Incluir teste de isolamento multi-tenant
- [ ] Consolidar findings em relatório com SLA de remediação
- [ ] Validar PCI scope e ASV scans se aplicável

**Owner**: Security
**Status**: Pendente, requer agendamento e orçamento

---

### ID 010 - Falta de política formal de segurança / Gaps de ISO 27001

**Categoria**: Governance
**Risco**: Controles técnicos não formalizados em política corporativa, dificultando auditoria e certificação
**Probabilidade**: Médio
**Impacto**: Médio
**Nível de risco**: **MÉDIO**

**Mitigation controls**:
- Políticas técnicas documentadas (Secrets Policy, Data Retention, Deployment)
- Checklist de prontidão
- Compliance Kit com mapeamento de controles

**Ações adicionais**:
- [ ] Formalizar Information Security Policy corporativa
- [ ] Criar Risk Register (este documento)
- [ ] Instituir processo de revisão periódica (quarterly)
- [ ] Documentar change control board e aprovação de mudanças
- [ ] Documentar vendor management process
- [ ] Criar awareness program de segurança

**Owner**: CTO / Security Lead
**Status**: Em progresso com este kit, requer formalização nível corporativo

---

## Resumo de risco por nível

| Nível | Contar | IDs |
|---|---|---|
| CRÍTICO | 2 | 001, 003 |
| ALTO | 6 | 002, 004, 005, 006, 007, 009 |
| MÉDIO | 2 | 008, 010 |
| BAIXO | 0 | — |

---

## Próximas ações (por mês)

### Abril 2026
- [ ] Completar testes de restauração de backup com documentação
- [ ] Iniciar criação de Incident Response Plan formal
- [ ] Agendar pentest anual

### Maio 2026
- [ ] Formalizar inventário de dados LGPD
- [ ] Implementar pre-commit hooks para detecção de secrets
- [ ] Validar MFA enforcement em produção

### Junho 2026
- [ ] Primeiro Disaster Recovery drill
- [ ] Audit de histórico git para secrets expostos
- [ ] Completar Policy formal de Segurança

### Trimestral
- [ ] Revisão de Risk Register
- [ ] Access review de privilégios administrativos
- [ ] Teste de backup restore

---

## Aprovação

| Role | Nome | Data | Assinatura |
|---|---|---|---|
| CTO | — | — | — |
| Security Lead | — | — | — |
| DevOps Lead | — | — | — |
| Compliance Officer | — | — | — |

---

## Histórico de revisão

| Data | Versão | Mudanças |
|---|---|---|
| 2026-04-06 | 1.0 | Documento inicial com 10 riscos prioritários |

