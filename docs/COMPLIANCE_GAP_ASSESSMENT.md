# T3CK Core — Compliance Gap Assessment

## Metodologia

Classificação usada:
- **Atendido**: há evidência clara no repositório
- **Parcial**: há evidência incompleta, declaratória ou dependente de operação externa
- **Não evidenciado**: não foi encontrado material suficiente nesta revisão

## 1. Governança e documentação

| Controle | Status | Evidência | Observação |
|---|---|---|---|
| Arquitetura documentada | Atendido | `docs/ARCHITECTURE.md` | Visão geral consistente |
| Guia de deploy e rollback | Atendido | `docs/DEPLOYMENT.md` | Inclui aprovação e rollback |
| Políticas formais aprovadas | Não evidenciado | — | Não localizadas políticas corporativas formais |
| Registro de riscos | Não evidenciado | — | Não localizado risk register |
| Runbooks operacionais completos | Parcial | `docs/DEPLOYMENT.md` referencia runbooks | Referências existem, mas não foram verificadas integralmente nesta revisão |

## 2. Segurança de desenvolvimento e entrega

| Controle | Status | Evidência | Observação |
|---|---|---|---|
| Lint/format/type-check em CI | Atendido | `.github/workflows/ci-cd.yml` | Gate básico implementado |
| Cobertura mínima de testes | Atendido | `.github/workflows/ci-cd.yml`, `.github/workflows/quality.yml` | Threshold 80% |
| Security scanning de dependências | Atendido | `.github/workflows/quality.yml`, `package.json` | Snyk + audit |
| Aprovação manual para produção | Atendido | `docs/DEPLOYMENT.md`, `.github/workflows/ci-cd.yml` | Uso de environment production |
| SAST formal | Parcial | `CHECKLIST_PRODUCTION_READINESS.md` | Marcado como pendente/parcial em checklist |

## 3. IAM, autenticação e sessão

| Controle | Status | Evidência | Observação |
|---|---|---|---|
| JWT com assimetria | Atendido | `README.md`, `docs/API.md` | RS256 documentado |
| Rotação de chaves JWT | Parcial | `docs/API.md`, checklist | Endpoint/documentação existe; falta evidência operacional |
| MFA | Parcial | `docs/API.md`, checklist | Documentado, sem prova de enforcement |
| Revogação de sessão/token | Atendido | `docs/API.md` | Endpoints descritos |
| Revisão periódica de acessos | Não evidenciado | — | Não localizada política/processo |

## 4. Proteção de dados

| Controle | Status | Evidência | Observação |
|---|---|---|---|
| Isolamento multi-tenant | Atendido | `firestore.rules` | Regras concretas por `tenant_id` |
| Criptografia e KMS | Parcial | `docs/ARCHITECTURE.md`, `docs/INFRASTRUCTURE_IaC.md`, checklist | Desenho existe; falta prova de uso real |
| Classificação de dados | Parcial | checklist | Declarado, sem artefato dedicado |
| Retenção e descarte | Parcial | checklist | Política citada, mas não consolidada |
| Inventário de dados pessoais | Não evidenciado | — | Necessário para LGPD |

## 5. Segurança de aplicação

| Controle | Status | Evidência | Observação |
|---|---|---|---|
| CORS/CSRF/XSS/Input validation | Atendido | `docs/API.md`, checklist | Controles documentados |
| WAF e rate limiting | Atendido | `docs/INFRASTRUCTURE_IaC.md`, checklist | Regras e thresholds documentados |
| Testes OWASP | Atendido | `package.json`, checklist | Scripts específicos presentes |
| Pentest recorrente | Parcial | `package.json`, checklist | Há script/menção; falta laudo |
| Gestão de vulnerabilidades com SLA | Não evidenciado | — | Não localizado processo formal |

## 6. Logging, monitoramento e resposta

| Controle | Status | Evidência | Observação |
|---|---|---|---|
| Métricas Prometheus | Atendido | `docs/METRICS_MONITORING_IMPLEMENTATION.md`, `docs/API.md` | `/metrics` documentado |
| Error tracking centralizado | Atendido | `docs/ERROR_TRACKING_IMPLEMENTATION.md` | Sentry documentado |
| Dashboards e alertas ativos | Parcial | docs + checklist | Ainda marcados parcialmente em checklist |
| Retenção de logs | Parcial | checklist | Controle citado, não consolidado |
| Processo formal de incidentes | Parcial | `docs/DEPLOYMENT.md` referencia incident response | Precisa evidência executada |

## 7. Backup, continuidade e DR

| Controle | Status | Evidência | Observação |
|---|---|---|---|
| Backup automatizado | Atendido | `docs/BACKUPS_IMPLEMENTATION_COMPREHENSIVE.md` | Firestore + Redis documentados |
| Monitoramento de backup | Atendido | mesmo documento | Métricas e alertas descritos |
| Restore testing | Parcial | checklist/docs | Recomendado/documentado, sem evidência executada |
| Plano de DR | Parcial | checklist/docs | Ainda aparece como lacuna parcial |
| RPO/RTO formalizados | Parcial | docs de backup citam necessidade | Não localizado documento final aprovado |

## 8. Compliance legal e contratual

| Controle | Status | Evidência | Observação |
|---|---|---|---|
| Regime de licenciamento claro | Não evidenciado | `README.md`, `LICENSE` | Há conflito direto |
| Política de privacidade interna | Não evidenciado | — | Não localizada |
| DPA/contratos com subprocessadores | Não evidenciado | — | Fora do repositório ou ausente |
| Base LGPD para tratamento | Não evidenciado | — | Não localizada |
| Escopo PCI formal | Não evidenciado | checklist apenas | Não suficiente para alegação formal |

## 9. Matriz de prioridade de remediação

### Bloqueadores críticos (Impede produção)
| Item | Status | Prazo |
|---|---|---|
| Resolver conflito LICENSE vs README | Não evidenciado | IMEDIATO |
| Confirmar escopo PCI (tokenização vs processamento) | Não evidenciado | IMEDIATO |
| Validar que `.env` produtivo não tem segredos versionados | Não evidenciado | IMEDIATO |
| Ativar MFA enforcement em produção e validar | Parcial | URGENT |
| Formalizar inventário de dados pessoais LGPD | Não evidenciado | 2 semanas |

### Importantes (Requerido para conformidade formal)
| Item | Status | Prazo |
|---|---|---|
| Criar Risk Register com avaliação formal | Não evidenciado | 1 mês |
| Formalizar Incident Response Plan com playbooks | Parcial | 1 mês |
| Comprovante de Restore Test (backup drill) | Parcial | 2 semanas |
| Plano de DR com RTO/RPO formalizados | Parcial | 1 mês |
| Consolidar relatório de vulnerabilidades (SAST/DAST) | Parcial | 2 semanas |
| Criação de processo de Access Review periódico | Não evidenciado | 3 semanas |

### Desejáveis (Melhor prática para certificação)
| Item | Status | Prazo |
|---|---|---|
| Treinamento de segurança com evidência | Não evidenciado | 1-2 meses |
| Vendor management formalized | Não evidenciado | 6 semanas |
| Change control board & approval matrix | Parcial | 1 mês |
| Privacy Impact Assessment (PIA) LGPD | Não evidenciado | 1 mês |

## 10. Ações concretas recomendadas (Roadmap)

### Semana 1-2
1. Resolver conflito de licenciamento (LICENSE vs README)
2. Atualizar `.env.example` com placeholders claros
3. Rotacionar any segredos expostos se necessário
4. Validar MFA está enforced em staging/produção
5. Executar restore test de backup com documentação

### Semana 3-4
6. Criar Risk Register com templates
7. Formalizar Incident Response Plan com base em ITIL/NIST
8. Consolidar relatório SAST/DAST resulta de CI/CD
9. Documentar RTO/RPO para cada serviço crítico

### Semana 5-6
10. Criar inventário de dados LGPD (identificadores, contato, pagamento, comportamento)
11. Mapear base legal de cada processamento
12. Formalizar Access Review process (quarterly)
13. Criar DPA template para subprocessadores

### Ongoing
14. Teste backup restore mensal
15. Atualizar Risk Register trimestral
16. Access review quarterly
17. Pentest anual (com laudo formal)
18. Treinamento anual de segurança

## 11. Principais gaps para fechar

### Críticos
1. **Resolver conflito de licenciamento** - README vs LICENSE com repositório aberto não é consistente
2. **Validar PCI scope** - Se não há processamento de PAN, reduzir escopo; se há, adicionar ASV scans e adquirente cert
3. **Inventário de dados LGPD** - Formalizar o que é coletado, processado, por quanto tempo, com qual base legal
4. **Restore test com evidência** - Documentar que backups podem ser restaurados em tempo conhecido
5. **Incident Response formal** - Playbooks, escalation paths, notificação de incidente

### Importantes
6. **Risk Register** - Formalizar avaliação de riscos por componente, decisões de mitigação
7. **Access Review periódico** - Quarterly review com aprovação de quem tem cada acesso
8. **Consolidar testes de segurança** - SAST, DAST, pentest com relatórios e SLA de correção
9. **Dashboards e alertas** - Validar que Grafana, Prometheus e alertas estão operacionais
10. **Vendor Management** - Formalize process para vet de e gerenciar fornecedores (GCP, AWS, gateway de pagamento, etc.)

### Desejáveis
11. **Treinamento de segurança** - Program de awareness com evidência de conclusão
12. **Change Control Board** - Formal aprovação de mudanças críticas
13. **Privacy Impact Assessment** - Validação de privacy by design
14. **Disaster Recovery drills** - Teste anual de plano de continuidade

## 12. Conclusão

O projeto está **forte em controles técnicos documentados**, mas ainda precisa transformar documentação e intenções em **pacote auditável formal**. As pendências são principalmente:

1. **Operacionais**: Evidência real de execução de controles (restore drills, access reviews, incident response)
2. **Documentais**: Políticas formais, risk register, DPA com subprocessadores
3. **Regulatórias**: Inventário LGPD, base legal, DPA, PCI scope se aplicável

**Estimativa de esforço para "auditável"**: 4-8 semanas de work focused, considerando que a infraestrutura técnica já está em lugar.
