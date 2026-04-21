# T3CK Core — Access Review and Management Process

## Visão geral

Este documento formaliza o processo de review periódico de acessos administrativos, API keys e credenciais do T3CK Core para garantir princípio de menor privilégio.

**Versão**: 1.0
**Última atualização**: 2026-04-06
**Frequência**: Trimestral (próximo: Julho 2026)

---

## Escopo

Este processo cobre:
- Acesso administrativo a plataforms (GCP, Firebase, GitHub, etc.)
- API keys e service accounts
- Credenciais de banco de dados
- SSH keys e deploy credentials
- Webhook secrets e integration keys
- Personal access tokens (GitHub, NPM, etc.)

Fora do escopo:
- Acesso de aplicação (tenant isolation já coberto por Firestore rules)
- Desenvolvimento local workstation access

---

## Princípios

1. **Menor privilégio**: Cada pessoa tem apenas acesso necessário para função
2. **Necessidade comercial**: Acesso justificado por role/projeto
3. **Segregação de ambientes**: Dev != Staging != Production
4. **Auditoria**: Toda concessão/revogação documentada
5. **Revisão periódica**: Ninguém retém acesso permanentemente

---

## Frequência de Review

| Tipo de acesso | Frequência | Owner |
|---|---|---|
| Admin (GCP, Firebase, AWS) | Trimestral | CTO |
| CI/CD & Deploy | Trimestral | DevOps Lead |
| Database & Secrets | Trimestral | Security Lead + DBA |
| GitHub & código | Semestral | CTO |
| Third-party integrations | Trimestral | Platform Lead |

---

## Processo de Review Trimestral

### Fase 1: Inventário (Semana 1)

**Owner**: CTO + DevOps Lead

**Tarefas**:

1. Extrair lista de todas contas GCP com permissions:
   ```
   gcloud projects get-iam-policy T3CK-PROD --flatten="bindings[].members" > gcp_iam_report.txt
   gcloud iam service-accounts list > service_accounts_report.txt
   ```

2. Extrair Firebase console access:
   ```
   Firebase console -> Gear icon -> Project Settings -> Members
   ```

3. Listar GitHub team members e permissions por repo:
   ```
   GitHub -> Organization -> Teams -> [Repo name] -> Members
   ```

4. Listar Datadog/Sentry/PagerDuty users:
   ```
   Each platform -> Settings -> Users
   ```

5. Consolidar tudo em spreadsheet com colunas:
   - Person name
   - Email
   - Role/Function
   - Current permissions
   - Start date (when granted)
   - Justificação (project/reason)

### Fase 2: Review de atual permissions (Semana 2)

**Owner**: Role owners (CTO, Security, DevOps, DBA)

**Para cada pessoa no inventário**:

1. ✓ Ou ✗ - Acesso ainda necessário?
   - ✓ = Manter
   - ✗ = Revogar
   - ? = Discuss com manager

2. ✓ Ou ✗ - Nívelcorreto de permissão?
   - ✓ = Correto (Viewer vs Editor vs Admin)
   - Upgrade/downgrade se necessário

3. ✓ Ou ✗ - Ambiente correto?
   - ✓ = Pessoa com acesso de dev também tem staging/prod confirmado necessário
   - ✗ = Remover prod access se dev-only

4. Notas de change log

### Fase 3: Remediation (Semana 3)

**Owner**: DevOps Lead + Security Lead

1. **Revocar acesso desnecessário**:
   ```
   # GCP example
   gcloud projects remove-iam-policy-binding T3CK-PROD \
     --member=user:person@company.com \
     --role=roles/viewer

   # GitHub example
   Organization settings -> Members -> Remove
   ```

2. **Ajustar níveis de permissão**:
   ```
   # GCP downgrade example
   gcloud projects add-iam-policy-binding T3CK-PROD \
     --member=user:person@company.com \
     --role=roles/viewer \
     --condition='expression=resource.name.endsWith("staging/*"),title=staging-only'
   ```

3. **Adicionar novos acessos conforme aprovado**:
   - Requer AP approvals
   - Documentado em change log
   - Enviado notificação ao beneficiary

4. **Rotacionar credenciais antigas**:
   ```
   # Service account keys older than 90 days
   Remover old keys, gerar new ones
   Update consumers (deployments, apps)
   Teste antes de deletar anti...
   ```

5. **Revogar API keys não usadas**:
   - Validar através de Cloud Logging (lastAuthenticatedTime < 90 days)
   - Se unused, delete com aprovação
   ```
   gcloud services api-keys delete [KEY_ID]
   ```

### Fase 4: Evidência & Documentação (Semana 4)

**Owner**: Compliance Lead

1. **Documento as mudanças**:
   - Pessoas removidas
   - Pessoas adicionadas
   - Pessoas com permissões alteradas
   - Credenciais rotacionadas

2. **Gere relatórios**:
   - Final lista de quem tem qual access
   - Change log com antes/depois
   - SLA de remediação (iniciado dia X, completo dia Y)

3. **Arquive para auditoria**:
   - Copie spreadsheet e relatórios para shared folder (compliance/access-reviews/)
   - Documente em changelog com data

4. **Comunicar resultado**:
   - Email para CTO/Security com resultado
   - Notifique pessoas afetadas das revogações
   - Celebre aprovações

---

## Change Control para Acesso Ad-hoc (Entre reviews)

Se alguém precisa novo acesso **fora** do ciclo trimestral:

1. **Request**:
   - Submeter em #access-requests Slack ou ticket
   - Incluir: nome, email, tipo de access, justificação, duração (permanente/temporal)

2. **Approval**:
   - Require manager approval + CTO/Security approval
   - Temporal access = deadline claro

3. **Provisioning**:
   - Implement within 1 business day
   - Notify requester confirmação

4. **Log**:
   - Documentar em access change log
   - Include no próximo review trimestral

---

## Acesso Removido (Offboarding)

Quando pessoa deixa time / muda de role:

1. **Notificação imediata**:
   - CTO/HR notifica @security-team + DevOps quando offboarding iniciado

2. **Revogação dentro de 24h**:
   - Remove de todos systems (GCP, GitHub, Datadog, etc.)
   - Rotacionar credenciais que pessoa conhecia

3. **Auditoria**:
   - Verificar Cloud Logging para suspicious activity últimos 30 dias
   - Se suspeito, investigar e documentar

4. **Archivos**:
   - Documentar remoção com data
   - Manter para auditoria por 7 anos

---

## Tipos de Acesso & Matriz RACI

### GCP Project Access

| Level | Role Name | Who | Frequency | Owner |
|---|---|---|---|---|
| **Admin** | Owners | CTO, Security Lead | Quarterly | CTO |
| **Dev** | Editors + Viewer on datasets | Engineers, DevOps | Quarterly | DevOps Lead |
| **Read-only** | Viewers | PM, Finance, Support | Annual | CTO |
| **Service Account** | Custom roles per app | Deployment services | Quarterly | DevOps |

### Firebase Console

| Level | Who | What | Frequency | Owner |
|---|---|---|---|---|
| **Admin** | CTO, Security Lead | All | Quarterly | CTO |
| **Editor** | DevOps Lead, Backend eng | Data + Settings | Quarterly | DevOps |
| **Viewer** | Product, Design | Firestore explorer | Annual | Product |

### GitHub

| Level | Who | What | Frequency | Owner |
|---|---|---|---|---|
| **Admin** | CTO, Platform lead | Org + repos | Semestral | CTO |
| **Maintainer** | Senior engineers | Code review + merge | Semestral | Tech lead |
| **Write** | Engineers | Commit + PR | Per hire | Hiring manager |
| **Read** | All | View code | Per hire | Hiring manager |

### Secrets Manager

| Account | Who | Frequency | Owner |
|---|---|---|---|
| **Production** | 2-3 DevOps on-call | Quarterly | Security Lead |
| **Staging** | All engineers | Quarterly | DevOps Lead |
| **Development** | Per developer | Per hire | Team lead |

---

## Anomaly Detection & Alerts

Monitorar logs para atividade suspicious:

1. **Multiple failed authentication attempts**:
   - Alert: > 3 failed logins em 5 min
   - Ação: Verify with person, reset cred se needed

2. **Access from unusual location**:
   - Alert: New geography seen for person
   - Ação: Verify com person

3. **Privilege escalation**:
   - Alert: Person added to admin group
   - Ação: Verify que foi via approved flow

4. **Mass permission grant**:
   - Alert: Single person granted to > 5 resources
   - Ação: Verify foi approved

---

## Privileged Access Management (PAM)

Para accounts de máximo risco:

1. **Production database access**:
   - Require approval before each access
   - MFA obrigatório
   - Audit log todas queries
   - Temporal sessions (máx 30 min)

2. **GCP production**:
   - Require approval before each change
   - MFA obrigatório
   - Audit logging enabled
   - No automation sem revisão manual

3. **Segredos críticos**:
   - Dual control (2 pessoas needed to rotate)
   - Approval workflow
   - Audit log todas operações

---

## Documentação & Evidence

Cache de evidence para auditoria:

```
compliance/
├── access-reviews/
│   ├── Q1-2026/
│   │   ├── inventory.xlsx
│   │   ├── changes.md
│   │   ├── approval-email.txt
│   │   └── summary.txt
│   ├── Q2-2026/
│   │   └── ...
│   └── audit-trail.txt (log of all changes)
```

---

## Checklists

### Pre-review Checklist

- [ ] Spreadsheet template prepared
- [ ] Access to GCP IAM console
- [ ] Access to Firebase console
- [ ] Access to GitHub settings
- [ ] Team notified of Q3 review timing
- [ ] Compliance lead scheduled for documentation

### During Review Checklist

- [ ] Inventário completo para todas platforms
- [ ] Role owners completaram assessment
- [ ] Change requests aprovados por managers
- [ ] Approval autorizado por CTO/Security
- [ ] Remediação executada
- [ ] Credenciais rotacionadas
- [ ] Pessoal notificado de mudanças

### Post-review Checklist

- [ ] Relatório consolidado
- [ ] Evidência arquivada
- [ ] CTO + Security signed off
- [ ] Próxima review date agendada
- [ ] Anomalies investigadas
- [ ] Feedback coletado para melhorias

---

## Approval & Sign-off

| Role | Signed | Date |
|---|---|---|
| CTO | ☐ | — |
| Security Lead | ☐ | — |
| Compliance Officer | ☐ | — |

---

## Version History

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | 2026-04-06 | Compliance Team | Initial process with quarterly cadence |

