# T3CK Core — Incident Response Plan

## Visão geral

Este plano define o procedimento, roles, escalation e comunicação para responder a incidentes de segurança, indisponibilidade ou compliance no T3CK Core.

**Versão**: 1.0
**Última atualização**: 2026-04-06
**Próxima revisão**: Anual / Pós-incidente

---

## Princípios

1. **Rapidez**: Minimizar tempo entre detecção e ação (MTTR)
2. **Clareza**: Escalation path claro, sem ambiguidade de quem faz o quê
3. **Rastreabilidade**: Toda ação documentada em timeline para pós-incidente
4. **Comunicação**: Notificação oportuna a stakeholders internos e externos conforme severidade
5. **Aprendizado**: Post-mortem e lições aprendidas após incidente

---

## Severidade e SLA

| Severidade | Descrição | Exemplos | MTTR SLA | Notification SLA |
|---|---|---|---|---|
| **SEV-1 (Critical)** | Serviço completamente indisponível ou dados críticos comprometidos | Data breach, 100% downtime, PAN exposto | < 15 min | < 5 min |
| **SEV-2 (High)** | Funcionalidade crítica degradada ou exposição limitada de dados | 50% performance drop, alguns tenants afetados | < 1 hora | < 15 min |
| **SEV-3 (Medium)** | Funcionalidade secundária afetada, impacto limitado | Rate limiting ativo, alertas falsos | < 4 horas | < 1 hora |
| **SEV-4 (Low)** | Observação/potencial issue, sem impacto operacional | Dependency vulnerabilidade de-priorized, typo em log | < 24 horas | < 4 horas |

---

## Escalation Matrix

```
ALERTA DETECTADO (CloudWatch, Sentry, PagerDuty, equipe)
         |
         v
    Avaliar Severidade
    (ver tabela acima)
         |
    +---------+---------+---------+
    |         |         |         |
    v         v         v         v
  SEV-1     SEV-2     SEV-3     SEV-4
   (5)       (2)       (1)       (0)

SEV-1 Escalation:
  -> Incident Commander (On-call)
  -> CTO
  -> Security Lead
  -> CEO (notificação alta diretoria)
  -> Legal/Compliance se breach

SEV-2 Escalation:
  -> On-call Engineer
  -> Tech Lead
  -> optionais: CTO, Security

SEV-3 Escalation:
  -> On-call ou Dev Team lead

SEV-4 Escalation:
  -> Backlog para próximo sprint
```

---

## Roles no Incident Response

| Role | Responsabilidade |
|---|---|
| **Incident Commander (IC)** | Coordena response, escalation, comunicação com stakeholders, agenda bridge calls |
| **Technical Lead** | Causa raiz investigation, coordena fixes técnicas |
| **Communications Lead** | Notificações externas, status page updates, templates de notificação |
| **DevOps / On-Call** | Restart serviços, rollback deploy, health checks |
| **Security Lead** | Investigação de breach, validação de blast radius |
| **DBA / Data** | Validação de integridade dados, restore if needed |

**Duty Rotation**: On-call engineer rotatividade semanal com backup
**Escalation de IC**: Tech Lead -> CTO -> CEO por severidade

---

## Playbooks por tipo de incidente

### Playbook 1: SEV-1 Data Breach / Vazamento de dados

**Detecção**:
- Alert em Cloud Logging (acesso anômalo)
- Aviso de security tool (scanner externo)
- Reporte de cliente
- CVSS score crítico identificado

**Ação imediata (primeiros 5 min)**:

1. **IC declara SEV-1** e ativa bridge call urgente
2. **Security Lead** inicia investigação:
   - Quais dados? (tipos, quantidade, tenants)
   - Blast radius (time window de acesso, fonte)
   - Exposição externa confirmada?
3. **Tech Lead** isolates impacted systems:
   - Preserva logs para análise
   - Revoga credenciais suspeitas
   - Rejeita tráfego de IP de origem se aplicável
4. **Communications** notifica:
   - Equipe interna (Slack #incident-sev1)
   - Legal team
   - Afetados (clientes se PII breached)
   - Authorities se exigido (LGPD, regulador)

**Fase de investigação (5-30 min)**:

5. Security Lead:
   - Conclui causa raiz (vulnerabilidade? misconfiguration? insider threat?)
   - Estima volume de dados e se havia encriptação
   - Recomenda remediação técnica
   - Identifica need for forense/investigação especializada

6. Tech Lead:
   - Implementa correção de segurança (patch, WAF rule, access revoke)
   - Testa fix em staging
   - Deploy fix com aprovação IC

7. DBA:
   - Audit logs de mudanças de dados
   - Verifica integridade de backups (não comprometidos)
   - Preserva snapshot para análise

**Fase de remediação (30-120 min)**:

8. Testes:
   - Simula bloqueio da vulnerabilidade
   - Valida que dados now protected
   - Verifica não há mais exposição

9. Comunicação:
   - Update status externo a cada 30 min
   - Preparar notificação final de resolução
   - Agenda post-mortem (dentro de 24h)

10. Documentação:
    - Timeline completa do incidente
    - Logs de todas ações
    - Screenshots de investigação
    - Causa raiz formal

**Post-incidente**:

11. Within 24h: Post-mortem meeting com all stakeholders
    - What happened (timeline clara)
    - Why it happened (root cause)
    - What we did (responses)
    - What we'll do differently (prevent future)
    - Assign owners de action items

12. Notificação a regulador se exigido

---

### Playbook 2: SEV-1 Complete Service Outage

**Detecção**:
- 0% uptime em serviço crítico > 30 segundos
- Celery Health check failing
- Load balancer reports all backends down

**Ação imediata (primeiros 2 min)**:

1. **IC escalates**, reúne On-call + Tech Lead em bridge call
2. **On-call** inicia checks:
   - Cloud Run – status de todas revisions?
   - Cloud SQL – conecta?
   - Firestore – queries respondendo?
   - Memorystore – Redis online?
3. **DevOps checks**:
   - Últimas 5 mudanças (recente deploy? infrastructure change?)
   - Rollback vs Forward fix decision

**If recent deploy (< 5 min atrás)**:
4. Rollback trigger:
   - Revert Cloud Run revision a versão anterior
   - Executar smoke tests
   - Validate uptime resume

**Else (infrastructure issue)**:
4. Diagnóstico:
   - Conexão database check
   - Network/firewall rules
   - Cert expiration?
   - Quota limites atingidos?

5. Mitigação depende de issue:
   - Database: Restart, failover, restore
   - Network: DNS troubleshoot, firewall
   - Quota: Increase imediato

6. Comunicação:
   - "We're investigating" in 5 min
   - "Identified as X" in 10 min
   - "Working on fix" in 15 min
   - "Service restoring" once resolved

**Post-incident**:
- Post-mortem dentro de 4 horas
- Previne recorrência com testes adicionais CI/CD

---

### Playbook 3: SEV-2 Partial Degradation / High Latency

**Detecção**:
- 50%+ request failures em endpoint
- P99 latency > 5 segundos
- Error rate spike

**Ação imediata (primeiros 10 min)**:

1. **Tech Lead** avalia:
   - Qual serviço? Qual endpoint?
   - Database queries slow?
   - Memory/CPU saturation?
   - Redis cache issue?
   - External API dependency slow?

2. **On-call**:
   - Scale up Cloud Run instances
   - Check database query performance
   - Clear cache if possible
   - Rate limit if needed to prevent cascade

3. **Investigation**:
   - Query logs (Cloud Logging + APM traces)
   - Correlate issue com recentes mudanças
   - Check dependency status (third-party APIsemão)

4. **Fix**:
   - Code hotfix se identifiado bug
   - Query optimization
   - Index addition if needed
   - Dependency fallback

5. **Communication**:
   - Notify eng + product of degradation
   - ETA for fix

**Post-incident**:
- Análise de causa raiz
- Previne recorrência (better thresholds, load test)

---

### Playbook 4: SEV-2/3 Security Vulnerability Detected

**Detecção**:
- Snyk identifica CVE crítica
- External scanner encontra vulnerability
- Pentester relata finding

**Ação imediata**:

1. **Security Lead** determines:
   - Severity score (CVSS)
   - Exploitable? (POC available?)
   - Afetadas nossas deps? Qual versão?

2. **Decision matrix**:
   - CVSS >= 9.0 AND exploitable -> SEV-1 immediate patch
   - CVSS 7-8.9 AND exploitable -> SEV-2 patch within hours
   - CVSS 5-6.9 -> SEV-3 patch in sprint
   - CVSS < 5 -> Backlog (accept risk)

3. **Tech Lead** for SEV-1/2:
   - Upgrade affected dependency
   - Run tests
   - Deploy to staging then production

4. **Communication**:
   - Document resolution time
   - Alert customers if applicable

---

### Playbook 5: SEV-1 Regulatory / Legal Issue

**Exempla**: LGPD fine, lawsuit notice, audit failure

**Ação imediata**:

1. **IC escalates ao CTO + Legal team** (imediato)
2. **Legal** assume lead (não tech)
3. **Tech lead** disponível para diagnóstico se needed
4. **Communications** aligns com legal antes de qualquer statement externo

**Não fazer**: Admitir culpa, make promises we can't keep, leak details

---

## Incident Checklist (durante incidente)

- [ ] Severity classificada?
- [ ] IC designado?
- [ ] Stakeholders notificados?
- [ ] Bridge call iniciada (SEV-1/2)?
- [ ] Investigação em progresso?
- [ ] RCA (Root Cause Analysis) iniciada?
- [ ] Fix testado antes deploy?
- [ ] Deploy executado?
- [ ] Validação que fix funcionou?
- [ ] Comunicação externa atualizada?
- [ ] Timeline documentada?
- [ ] Post-mortem agendado?

---

## Communication Templates

### Initial Notification (< 5 min of detection)

```
Subject: [INCIDENT SEV-X] T3CK Core - Service Status

We're investigating an issue affecting [SERVICE/FEATURE].
We will provide updates every [15/30] minutes.

Current status: [INVESTIGATION/IN PROGRESS/RESOLVING]
```

### Update (Every 15-30 min per SLA)

```
Subject: [UPDATE SEV-X] T3CK Core - Incident Status

Timeline:
- 14:30 UTC: Issue detected
- 14:32 UTC: Root cause identified: [BRIEF DESCRIPTION]
- 14:35 UTC: Fix deployed
- 14:38 UTC: Service restored, monitoring closely

Next update: [TIME]
```

### Resolution

```
Subject: [RESOLVED SEV-X] T3CK Core - Incident Resolved

We have resolved the incident affecting [SERVICE].
Impact: [# of users, downtime duration, data loss if any]
Root cause: [BRIEF EXPLANATION]
Prevention: [1-2 improvements we'll make]

Post-mortem available at: [LINK] (internal)
```

---

## Post-Incident Review (within 24 hours)

### Meeting Attendees
- Incident Commander
- Tech Lead
- Secondary engineers involved
- Product Lead
- Relevant manager
- Optionalmente: Legal/Security se applicável

### Agenda (60 min)

1. **Timeline reconstruction** (10 min)
   - Exact times from detection to resolution
   - What systems showed warnings
   - Why not caught sooner?

2. **Root Cause Analysis** (20 min)
   - What was the underlying problem?
   - Why did it happen?
   - Why didn't we catch it?

3. **Impact assessment** (5 min)
   - How many users affected?
   - Duration of outage?
   - Data loss / exposure?
   - Financial impact?

4. **Response effectiveness** (10 min)
   - Did escalation work well?
   - Communication adequate?
   - Speed of response?

5. **Action items** (15 min)
   - What process changes?
   - What testing should we add?
   - What monitoring needs improvement?
   - Who is owner of each action?
   - Due date for each?

### Output: Post-Mortem Document

```markdown
# Incident [DATE] - [TITLE]

## Summary
[1 paragraph overview]

## Impact
- Users affected: [#]
- Duration: [min]
- Repeat: [yes/no - if yes, how often?]

## Timeline
| Time | Event |
|---|---|
| 14:30 | Alert fired |
| 14:32 | Investigated by @name |
| ...   | ... |
| 14:45 | Service restored |

## Root Cause
[Detailed explanation with context]

## Contributing Factors
- [Factor 1]
- [Factor 2]

## Response Actions Taken
- [Action 1]
- [Action 2]

## Action Items (Prevention)
- [ ] [Owner] - [Description] - Due [DATE]
- [ ] [Owner] - [Description] - Due [DATE]

## Lessons Learned
1. What we did well
2. What we could improve
3. Unexpected discoveries
```

---

## Escalation Contact List

Manter atualizado com contatos reais:

| Role | Name | Phone | Email | Backup |
|---|---|---|---|---|
| CTO | [NAME] | +55 11 XXXX-XXXX | [email] | [BACKUP] |
| Security Lead | [NAME] | — | [email] | [BACKUP] |
| DevOps Lead | [NAME] | — | [email] | [BACKUP] |
| On-Call | [ROTATION] | — | [Slack] | [ROTATION] |
| Legal | [NAME] | — | [email] | [BACKUP] |

---

## Tools & Integrations

| Tool | Purpose | Access |
|---|---|---|
| **CloudWatch** | Monitoring & alerting | AWS console |
| **Cloud Logging** | Centralized logs | GCP console |
| **Sentry** | Error tracking | [URL]/organizations |
| **PagerDuty** | On-call rotation | [URL] |
| **Grafana** | Dashboards | [URL] |
| **Slack #incidents** | Comms | Invite only |
| **War Room Bridge** | Emergency calls | [URL] |

---

## Training & Drills

- **Quarterly**: Incident response drill (simulated SEV-1)
- **Annual**: Full tabletop exercise (legal, finance involved)
- **Per-incident**: Post-mortem learning
- **New hire**: IR plan walkthrough in onboarding

---

## Approval & Sign-off

| Role | Approval | Date |
|---|---|---|
| CTO | ☐ | — |
| Security Lead | ☐ | — |
| CEO | ☐ | — |

---

## Version History

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | 2026-04-06 | Compliance Team | Initial plan with 5 playbooks |

