# T3CK Core — Compliance Evidence Index

## 📋 Índice consolidado de evidências de compliance

Este índice referencia todos documentos, scripts, configurações e artefatos de compliance do T3CK Core.

**Última atualização**: 2026-04-06
**Classif**: Compliance Internal Use / Audit

---

## 1. Documentação de Governance

| Documento | Objetivo | Frequência revisão | Status |
|---|---|---|---|
| `README.md` | Visão geral do projeto | Anual | ✓ Ativo |
| `CHECKLIST_PRODUCTION_READINESS.md` | 200+ checklist de prontidão | Trimestral | ✓ Ativo |
| `ARCHITECTURE.md` | Arquitetura de sistemas | Ad-hoc (mudança) | ✓ Ativo |
| **COMPLIANCE_KIT.md** | Kit consolidado de compliance | Anual | ✓ **NOVO** |
| **COMPLIANCE_GAP_ASSESSMENT.md** | Avaliação de gaps | Trimestral | ✓ **ATUALIZADO** |
| **RISK_REGISTER.md** | Registro de riscos | Trimestral | ✓ **NOVO** |
| **INCIDENT_RESPONSE_PLAN.md** | Plano de resposta a incidentes | Anual | ✓ **NOVO** |
| **ACCESS_REVIEW_PROCESS.md** | Processo de revisão de acesso | Quarterly | ✓ **NOVO** |

---

## 2. Políticas de Segurança & Conformidade

| Documento | Escopo | Aprovação | Status |
|---|---|---|---|
| `.github/SECRETS.md` | Gestão de secrets e credenciais | CTO | ✓ Ativo |
| **SECRETS_POLICY.md** | Política formalizada de secrets | CTO + Security | ✓ **NOVO** |
| `docs/CONFIG_MANAGEMENT_IMPLEMENTATION.md` | Secret Manager & KMS config | CTO | ✓ Ativo |
| **DATA_RETENTION_AND_DISPOSAL_POLICY.md** | Retenção de logs, backup, descarte | Compliance | ✓ **NOVO** |
| **LGPD_DATA_INVENTORY.md** | Inventário de dados pessoais LGPD | Legal + DPO | ✓ **NOVO** |
| `docs/BACKUPS_IMPLEMENTATION_COMPREHENSIVE.md` | Estratégia de backup | DevOps | ✓ Ativo |
| **BACKUP_DR_TESTING_PROCEDURES.md** | Teste de restore e DR drill | DevOps + CTO | ✓ **NOVO** |

---

## 3. Segurança de Aplicação & API

| Documento | Cobertura | Status |
|---|---|---|
| `docs/API.md` | Endpoints, autenticação, rate limiting | ✓ Ativo |
| `docs/SECURITY.md` (se existe) | Guia de segurança para devs | ✓ Referenciado |
| `package.json` | Dependências com audit levels | ✓ Ativo |
| `.github/workflows/quality.yml` | Security scanning (Snyk) | ✓ Ativo |
| **VULNERABILITY_MANAGEMENT.md** | Programa formalizado de vulnerabilidades | ✓ **NOVO** |

---

## 4. Infraestrutura & Cloud

| Documento | Escopo | Auditado por |
|---|---|---|
| `docs/INFRASTRUCTURE_IaC.md` | Terraform modules, GCP setup | DevOps |
| `infrastructure/` | Código IaC | Git history |
| `docs/DEPLOYMENT.md` | CI/CD pipeline, rollback, blue-green | CTO |
| `.github/workflows/ci-cd.yml` | Pipeline config | DevOps |
| `.github/workflows/backup-runner.yml` | Backup automation | DevOps |

---

## 5. Observabilidade & Monitoramento

| Documento | Ferramenta | Status |
|---|---|---|
| `docs/METRICS_MONITORING_IMPLEMENTATION.md` | Prometheus, Grafana | ✓ Ativo |
| `docs/ERROR_TRACKING_IMPLEMENTATION.md` | Sentry integration | ✓ Ativo |
| `docs/HEALTH_CHECKS_IMPLEMENTATION.md` | Service health monitoring | ✓ Ativo |
| Cloud Logging | GCP centralized logging | ✓ Ativo |
| CloudWatch | Alerts e notificações | ✓ Ativo |

---

## 6. Testes & Validação

| Artefato | Frequência | Owner |
|---|---|---|
| `.github/workflows/quality.yml` | Em cada PR | Eng team |
| `jest.config.js` + tests/ | Unit + integration tests | Eng team |
| `e2e/` | End-to-end tests | QA |
| Pentest (TBD) | Anual | Security |
| Restore test (monthly) | 1º dia útil mês | DevOps |
| DR drill (quarterly) | Uma vez por trimestre | DevOps + CTO |

---

## 7. Referência cruzada por tema

### Autenticação & Autorização

- `docs/API.md` - JWT RS256, MFA, token rotation
- `CHECKLIST_PRODUCTION_READINESS.md` - Auth Service checklist
- `INCIDENT_RESPONSE_PLAN.md` - SEV-1 playbook para breach
- `ACCESS_REVIEW_PROCESS.md` - Quarterly access review

### Proteção de dados & Privacidade

- `firestore.rules` - Isolamento por tenant
- **LGPD_DATA_INVENTORY.md** - Inventário de dados pessoais
- **DATA_RETENTION_AND_DISPOSAL_POLICY.md** - Retenção & descarte
- **SECRETS_POLICY.md** - Proteção de credenciais
- `docs/CONFIG_MANAGEMENT_IMPLEMENTATION.md` - KMS & encryption

### Continuidade & Recuperação

- `docs/BACKUPS_IMPLEMENTATION_COMPREHENSIVE.md` - Estratégia backup
- **BACKUP_DR_TESTING_PROCEDURES.md** - Teste mensal/trimestral/anual
- `docs/DEPLOYMENT.md` - Rollback & zero-downtime deploy
- `docs/INFRASTRUCTURE_IaC.md` - Infrastructure resilience

### Resposta a Incidentes

- **INCIDENT_RESPONSE_PLAN.md** - Playbooks e escalation
- **RISK_REGISTER.md** - Riscos com SLA de remediação
- `docs/ERROR_TRACKING_IMPLEMENTATION.md` - Error monitoring

### Conformidade & Auditoría

- **COMPLIANCE_KIT.md** - Mapeamento de controles (LGPD, ISO 27001, OWASP)
- **COMPLIANCE_GAP_ASSESSMENT.md** - Gaps por framework
- **RISK_REGISTER.md** - Riscos identificados
- **ACCESS_REVIEW_PROCESS.md** - Revisão trimestral de acesso

---

## 8. Segredos & Credenciais (Não inclusos aqui por segurança)

**Localização**: Fora do repositório

- GCP Secret Manager (produção)
- `.env.example` (template apenas)
- GitHub Secrets (CI/CD)
- PagerDuty integration token (sensível)
- Snyk API key (sensível)

**Política**: Vide `SECRETS_POLICY.md`

---

## 9. Integração com Pipelines

### Validações em CI/CD

```yaml
# .github/workflows/quality.yml
- Lint (ESLint)
- Type check (TypeScript)
- Tests (Jest 80%+)
- Security scan (Snyk)
- Build (pnpm)
- SBOM generation (opcional)
```

### Alertas & Monitoring

```
CloudWatch -> PagerDuty -> On-call
Sentry errors -> Email alerts
Prometheus metrics -> Grafana dashboards
```

---

## 10. Documentos ainda em TODO / Pendentes

| Item | Status | Owner | Deadline |
|---|---|---|---|
| SOP de processamento PCI DSS (se aplicável) | Pendente | Security | Maio 2026 |
| Security training program | Pendente | HR / Security | Próximo trimestre |
| Vendor management SOP | Pendente | Procurement | Próximo trimestre |
| Change Control Board | Parcial | CTO | Próximo trimestre |
| Privacy Impact Assessment (PIA) LGPD | Pendente | Legal | Próximo trimestre |
| Pentest anual (2026) | Pendente | Security | Q2 2026 |

---

## 11. Alertas para Auditoria

- ⚠️ `README.md` e `LICENSE` apresentam conflito sobre regime (MIT vs proprietary)
- ⚠️ Existe `.env` na raiz; validar que não foi versionado
- ⚠️ Parte das evidências é declaratória; validar em ambiente real
- ⚠️ PCI DSS escopo ainda não claramente definido (tokenização vs full processing)
- ⚠️ Pentest anual ainda não agendado formalmente

---

## 12. Ciclo de Revisão

### Revisões de conformidade

| Frequência | Tipo | Owner | Próximo |
|---|---|---|---|
| Trimestral | Risk Register + gaps | CTO + Security | Julho 2026 |
| Trimestral | Access Review | Compliance officer | Julho 2026 |
| Semestral | Vulnerability log | Security Lead | Junho/Dez |
| Anual | Full audit readiness | CTO + External | Nov 2026 |

---

## 13. Como adicionar novo documento

1. **Criar novo arquivo** em `docs/`
2. **Adicionar referência** aqui no INDEX com:
   - Título
   - Objetivo
   - Frequência de revisão
   - Status (✓ Ativo / ⚠️ Risco / ☐ TODO)
3. **Link cruzado** em seção temática relevante
4. **Commit** com mensagem: `docs: add [DOCUMENT_NAME]`

---

## 14. Aprovação Final

| Role | Aprovação | Data |
|---|---|---|
| CTO | ☐ | — |
| Compliance Officer | ☐ | — |
| Security Lead | ☐ | — |

---

## 15. Version History

| Versão | Data | Mudanças |
|---|---|---|
| 1.0 | 2026-04-06 | Index inicial com 17 documentos (8 novos) |


