# T3CK Core — Backup & Disaster Recovery Testing Procedures

## Visão geral

Este documento define o procedimento para teste regular de restauração de backups e plano de disaster recovery (DR) para validar que récupération é viável em caso de incidente crítico.

**Versão**: 1.0
**Última atualização**: 2026-04-06
**Frequência**: Mensal (restore test), Trimestral (DR drill), Anual (full scenario)

---

## 1. Contexto de Backup Atual

### Dados protegidos

| Fonte | Tipo | Retenção | Localização |
|---|---|---|---|
| **Firestore** | NoSQL documents | 365 dias | GCS buckets |
| **Cloud SQL** | Relational data | 365 dias | GCS buckets |
| **Redis/Memorystore** | Cache | 7 dias (transiente) | GCS buckets |
| **GCS Buckets** | Uploads/media | 365 dias | GCS buckets (versioning) |
| **Firestore Rules** | Config | Versionado em Git | GitHub repo |

### RTO/RPO Targets

| Serviço | RTO | RPO | Impacto |
|---|---|---|---|
| **Website/API** | 30 min | 1 hora | Revenue impact alto |
| **Firestore (client data)** | 2 horas | 1 hora | Data loss crítico |
| **Cloud SQL (orders)** | 1 hora | 15 min | Transaction integrity |
| **Redis (cache)** | 10 min | 0 (regenerável) | Performance impact |
| **GCS Upload** | 2 horas | 1 hora | Customer uploads lost |

---

## 2. Monthly Restore Test (Validar que backup se recupera)

**Objetivo**: Verificar que backup pode ser restaurado e validar dados
**Frequência**: 1º dia útil de cada mês
**Duração**: 1-2 horas
**Owner**: DevOps Lead + DBA

### Passo 1: Seleção de backup (15 min)

```bash
# List disponíveis backups Firestore
gsutil ls -L gs://t3ck-backup-firestore/

# Pick one from last 7 days (for rotation)
gsutil ls gs://t3ck-backup-firestore/ | tail -5

# Show: gs://t3ck-backup-firestore/firestore-backup-2026-04-06-1800.tar.gz
```

### Passo 2: Staging Environment Prep (15 min)

```bash
# Certifique-se de que staging está clean
# 1. Snapshot staging firestore para compara depois
gsutil cp gs://staging-firestore-current/ gs://staging-firestore-backup-pre-restore/ -r

# 2. Clear staging data (simula clean slate)
# Usar Firestore console para delete collections (opcional, apenas test)
```

### Passo 3: Restore (15 min)

**Firestore**:
```bash
# Download backup
gsutil cp gs://t3ck-backup-firestore/firestore-backup-2026-04-06-1800.tar.gz /tmp/

# Extract
tar -xzf /tmp/firestore-backup-2026-04-06-1800.tar.gz -C /tmp/

# Restore (Firestore import)
gcloud firestore import gs://t3ck-backup-firestore/firestore-backup-2026-04-06-1800/ \
  --database-id default  \
  --project t3ck-staging
```

**Cloud SQL**:
```bash
# Get backup binary log position
gcloud sql backups list --instance=staging-db

# Restore from backup
gcloud sql backups restore BACKUP_ID --backup-instance=staging-db \
  --backup-configuration=automated

# Or: Create clone from backup
gcloud sql instances clone staging-db staging-db-restore-test \
  --point-in-time=TIMESTAMP
```

**Redis** (optional, cache):
```bash
# Download latest dump
gsutil cp gs://t3ck-backup-redis/dump-latest.rdb /tmp/

# For staging, usually not needed (cache can regenerate)
# But if needed: flush cache and reimport
redis-cli --rdb /tmp/dump-latest.rdb

# Monitor: Cache should repopulate on first requests
```

### Passo 4: Validação (30 min)

**Queries de sanidade check**:
```bash
# Firestore: Validar documento counts
gcloud firestore query --collection=customers --limit=1 | wc -l

# Compare pre-restore vs post-restore counts
# Example:
# Customers: 15234 (esperado)
# Orders: 48923 (esperado)
# Products: 1203 (esperado)

# Cloud SQL: Check data consistency
mysql> SELECT COUNT(*) FROM orders;
mysql> SELECT MAX(updated_at) FROM orders;
mysql> SELECT COUNT(DISTINCT customer_id) FROM orders;
```

**Teste funcional**:
```bash
# 1. Load staging website
curl https://staging.t3ck.com/api/health

# 2. Verificar alguns endpoints
curl https://staging.t3ck.com/api/v1/customers/count
curl https://staging.t3ck.com/api/v1/orders/last-100

# 3. Simular customer flow (opcional)
curl -X POST https://staging.t3ck.com/api/v1/customers/search \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com"}'

# 4. Validar que dados restaurados estão presentes
# Resultado: 200 OK com dados esperados
```

### Passo 5: Documentação (10 min)

**Log test result**:

```markdown
## Monthly Restore Test - April 2026

**Date**: 2026-04-01
**Backup date**: 2026-03-31 (1 day ago)
**Owner**: @devops-team

### Results
- Firestore restore: ✓ Success (45 min)
  - Documents count: 150,234 (matched expected)
  - Queries responding: ✓

- Cloud SQL restore: ✓ Success (30 min)
  - Rows: 500,123 (matched expected)
  - Last backup: 2026-03-31 23:00 UTC

- Redis: N/A (cache regenerated)

### Data Validation
- /api/health: ✓ 200 OK
- Customer search: ✓ Found 15,234 customers
- Order history: ✓ Available for restore

### Issues Found
(None)

### Next test: 2026-05-01
```

Arquivo: `ops/backup-restore-tests/april-2026.md`

### Passo 6: Clean Up (5 min)

```bash
# Restore staging to pre-test state (if needed)
gcloud sql instances clone t3ck-prod t3ck-staging --source-instance=prod

# Or keep restored clone for inspection and delete after
gcloud sql instances delete staging-db-restore-test
```

---

## 3. Quarterly Disaster Recovery Drill

**Objetivo**: Teste full scenario de recovery de disaster
**Frequência**: Uma vez ao trimestre (T1=Jan, T2=Apr, T3=Jul, T4=Oct)
**Duração**: 4-6 horas (meio-turno)
**Owner**: CTO + DevOps + DBA
**Participantes**: Equipe de on-call, platform, maybe vendor (GCP TAM)

### Cenário de Teste (Escolher um por trimestre)

**T1 2026 (Jan)**: Primary region Firestore corruption
**T2 2026 (Apr)**: Cloud SQL complete failure
**T3 2026 (Jul)**: GCS bucket accidentally deleted
**T4 2026 (Oct)**: Multi-region failover scenario

### Exemplo: T2 - Cloud SQL Complete Failure

#### Fase 1: Simular DisasterAssert

```bash
# Criar novo db "staging-dr" como target de restauração
gcloud sql instances create staging-dr \
  --tier=db-f1-micro \
  --region=southamerica-east1 \
  --availability-type=REGIONAL

# Deixar limpo (sem dados) para simular fresh recovery
```

#### Fase 2: Recovery Procedure

**Owner**: DBA + DevOps
**Time limit**: 1 hour (target RTO)

```bash
# 1. Identificar latest good backup
gcloud sql backups list --instance=production-db \
  | grep "SUCCESSFUL" | head -1

# 2. Restore backup para novo instance
gcloud sql backups restore BACKUP_ID \
  --backup-instance=production-db \
  --target-instance=staging-dr

# 3. Validar dados foram restored
mysql -h staging-dr-ip -u admin -p << EOF
  SELECT COUNT(*) as row_count FROM orders;
  SELECT MAX(updated_at) as latest_update FROM orders;
  SHOW TABLE STATUS;
EOF

# 4. Configure application connection
# Update staging-dr connection string em staging app
# Deploy staging app para point to staging-dr

# 5. Run smoke tests
curl https://staging-new.t3ck.com/api/health
pytest tests/e2e/smoke_tests.py
```

**Checkpoint**: Produção estava down, agora recuperada? ✓ YES/NO

#### Fase 3: Failover Automation Check

**Owner**: DevOps
**Time limit**: 30 min

```bash
# Validar que failover scripts funcionam:
./scripts/failover-to-standby.sh staging-dr

# Expected result:
# ✓ DNS updated (if using)
# ✓ App endpoints responding
# ✓ Monitoring switched
# ✓ No data loss (verified checksums)
```

#### Fase 4: Lessons Learned (30 min)

**Team retrospective**:
- Quanto tempo levou? (vs. RTO target)
- Quais steps faltam documentação?
- Qual equipamento/permissão faltou?
- Qual a causa raiz deste scenario e prevenção?

**Output**: Documento de lessons learned:

```markdown
## Q2 2026 DR Drill - Cloud SQL Failure

**Scenario**: Production Cloud SQL lost (simulated)
**Time to recover**: 45 minutes (RTO target: 1 hour) ✓
**Data loss**: 0 rows (RPO target: 15 min) ✓

### What went well
- Backup restore script worked
- Failover DNS updated automatically
- Smoke tests caught issues early

### What didn't go well
- Manual connection string update took 10 min (automate)
- Missing ACL for staging-dr instance caused 5 min delay

### Action items
- [ ] Automate connection string updates via env var
- [ ] Pre-grant IAM roles for staging-dr instance
- [ ] Add failover dry-run to weekly automation tests
- [ ] Update runbook with timing expectations

Next drill: 2026-07-01 (Firestore scenario)
```

---

## 4. Annual Full Disaster Recovery Exercise

**Objetivo**: Teste completo com todos sistemas, includindo comunicação
**Frequência**: Uma vez ao ano (ex: Julho)
**Duração**: Full day (8 horas)
**Owner**: CTO + VP Ops
**Participantes**: Eng, Finance, CustSucc, CEO

### Formato: Tabletop Exercise

**Timeline**:
- 9:00 AM: Briefing (objetivo, scenario, time)
- 9:30 AM-12:30 PM: Technical recovery (with SLA clock running)
- 12:30 PM-1:00 PM: Lunch break
- 1:00 PM-3:00 PM: Communication & customer handling simulation
- 3:00 PM-4:00 PM: Retrospective

### Scenario Example: Multi-region meltdown

```
2026-07-15 08:00 AM UTC:
"All GCP resources in southamerica-east1 are unavailable.
 Primary database is unreachable.
 200 customers are blocked from completing purchases.
 CEO wants status in 30 minutes."

Go!
```

### Roles & Responsibilities (During drill):

| Role | Responsibility |
|---|---|
| **Incident Commander** | Leads response, escalation, big-picture decisions |
| **Tech Lead** | Technical recovery (restore backups, verify data) |
| **Communications** | Status updates, customer notifications, social media |
| **CEO/Finance** | Business impact assessment, legal considerations |
| **Customer Success** | Handle customer complaints, refunds, escalations |

### Checkpoints (With time tracking):

```
T+0m:   Incident declared
T+15m:  RCA identified (primary region down)
T+30m:  Backup restoration started (PRIMARY CHECKPOINT)
T+45m:  Data validated (50% of tables verified)
T+60m:  App cluster failover initiated (SECONDARY CHECKPOINT)
T+90m:  60% traffic restored to backup region
T+120m: 95% services online (TERTIARY CHECKPOINT)
T+180m: Full recovery, SLO met
```

**Success Criteria**:
- RTO met (< 1 hour for core services)
- RPO met (< 1 hour data loss)
- All participants could execute their roles
- Communications accurate and timely
- No actual downtime (simulated)

---

## 5. RTO/RPO Optimization Roadmap

### Current State:
- Firestore: RTO ~2h, RPO ~1h
- Cloud SQL: RTO ~1h, RPO ~15m
- GCS: RTO ~2h, RPO ~1h

### Improvements:

**Q3 2026**:
- [ ] Set up multi-region Firestore replication (RTO -> 30m)
- [ ] Implement Cloud SQL read replicas (RTO -> 15m)

**Q4 2026**:
- [ ] Automated failover trigger (RTO -> 5m)
- [ ] BGP failover for DNS (RTO -> <1m for routing)

**2027**:
- [ ] Active-active multi-region (eliminate RTO for some services)

---

## 6. Backup Monitoring & Alerts

### Daily checks:

```bash
# Daily at 6:00 AM UTC
gcloud sql backups list --instance=production-db | head -1
# Alert if NO backup from yesterday

gsutil ls gs://t3ck-backup-firestore/ | tail -1
# Alert if LATEST backup is > 24h old

gsutil du -s gs://t3ck-backup-*
# Alert if SIZE growing unexpectedly (maybe uncompressed duplicates)
```

### Alerts (via CloudWatch/Alerting):

- Backup execution failed
- Backup verification failed
- Restore time exceeded threshold
- Backup size anomaly
- Restore test not executed (monthly)

---

## 7. Checklists

### Monthly Restore Test Checklist

- [ ] Schedule: 1º dia útil do mês
- [ ] Select backup from last 7 days
- [ ] Clear staging environment
- [ ] Restore Firestore
- [ ] Restore Cloud SQL
- [ ] Validate data counts
- [ ] Run smoke tests (API health)
- [ ] Run functional tests (query sample data)
- [ ] Document results
- [ ] Clean up test resources
- [ ] Update next month's date

### Quarterly DR Drill Checklist

- [ ] Select scenario (rotate through list)
- [ ] Notify team 1 week in advance
- [ ] Reserve 4 hours of time
- [ ] Prepare simulation environment
- [ ] Brief participants on scenario
- [ ] Execute recovery procedures (with SLA timing)
- [ ] Validate restore completeness
- [ ] Team retrospective
- [ ] Document lições aprendidas
- [ ] Close action items from previous drill

### Annual Exercise Checklist

- [ ] Schedule full day (notify all teams)
- [ ] Define realistic scenario
- [ ] Prepare simulation infrastructure
- [ ] Brief all participants including non-tech
- [ ] Execute with SLA pressure/time constraints
- [ ] Simulate customer communication
- [ ] Debrief with retrospective
- [ ] Document findings in report

---

## 8. Documentação & Artifacts

Manter backup de todos os documentos:

```
ops/
├── backup-restore-tests/
│   ├── april-2026.md
│   ├── may-2026.md
│   └── ...
├── dr-drills/
│   ├── q2-2026-cloud-sql-failure.md
│   ├── q3-2026-gcs-deletion.md
│   └── ...
├── annual-exercise/
│   ├── 2026-july-full-scenario.md
│   └── findings.md
└── rto-rpo-targets.md
```

---

## Aprovação

| Role | Assinatura | Data |
|---|---|---|
| CTO | — | — |
| DevOps Lead | — | — |
| DBA | — | — |

**Próximo teste de restore**: 2026-05-01
**Próximo DR drill**: 2026-07-01
**Próximo exercício anual**: 2026-07-15

