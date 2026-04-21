# T3CK Core — Data Retention, Backup and Disposal Policy

## 1. Objetivo

Consolidar a política de retenção de logs, retenção de backups e descarte de dados do T3CK Core a partir das evidências e decisões documentadas no repositório.

## 2. Princípios

1. reter apenas pelo tempo necessário para operação, segurança, auditoria e obrigação legal
2. proteger dados em repouso e em trânsito durante todo o ciclo de vida
3. aplicar menor privilégio ao acesso a logs, backups e dados exportados
4. garantir descarte seguro e rastreável ao fim da retenção
5. separar ambientes de desenvolvimento, staging e produção

## 3. Escopo

Esta política cobre:
- logs de aplicação e infraestrutura
- métricas e eventos de erro
- backups de Firestore e Redis
- exportações de tenant e artefatos de offboarding
- dados operacionais armazenados pelo sistema

## 4. Bases documentais no repositório

- `docs/BACKUPS_IMPLEMENTATION.md`
- `docs/BACKUPS_IMPLEMENTATION_COMPREHENSIVE.md`
- `docs/METRICS_MONITORING_IMPLEMENTATION.md`
- `docs/ERROR_TRACKING_IMPLEMENTATION.md`
- `docs/DEPLOYMENT.md`
- `docs/INFRASTRUCTURE_IaC.md`
- `CHECKLIST_PRODUCTION_READINESS.md`
- `firestore.rules`

## 5. Política de retenção

### 5.1 Logs de aplicação e infraestrutura

Diretriz:
- logs devem ser centralizados em plataforma apropriada
- logs não devem armazenar secrets, tokens, cookies, API keys ou credenciais
- logs de produção devem ter retenção definida e revisada periodicamente

Retenção padrão adotada por esta política:
- logs operacionais correntes: **90 dias**
- logs de segurança e auditoria: **180 dias**
- exceções legais/contratuais: conforme exigência formal aplicável

Justificativa:
- `docs/INFRASTRUCTURE_IaC.md` menciona retenção de 30 dias para logs WAF/Cloud Logging em parte da implementação
- `CHECKLIST_PRODUCTION_READINESS.md` marca política de retenção de logs como lacuna parcial
- para consolidar a política, esta regra padroniza retenção mínima e deve prevalecer sobre defaults dispersos até ajuste da infraestrutura

Requisitos:
- revisar periodicamente volume, custo e necessidade regulatória
- mascarar ou excluir dados sensíveis antes do envio a sistemas de log
- restringir acesso operacional por função

### 5.2 Error tracking e eventos de monitoramento

Diretriz:
- eventos de erro devem remover cabeçalhos sensíveis antes do envio
- dados enviados para ferramentas de error tracking devem seguir princípio de minimização

Retenção padrão adotada:
- eventos de erro e troubleshooting: **90 dias**
- métricas agregadas: conforme retenção da plataforma de observabilidade

Justificativa:
- `docs/ERROR_TRACKING_IMPLEMENTATION.md` documenta remoção de `authorization`, `cookie`, `x-api-key` e outros headers sensíveis
- o mesmo documento recomenda ajuste de retenção no provedor

### 5.3 Backups

Diretriz:
- backups devem permanecer criptografados em repouso
- buckets devem bloquear acesso público
- uploads devem exigir TLS
- restauração deve ser testada periodicamente

Retenção padrão adotada:
- backups operacionais: **365 dias**
- cópias intermediárias/incompletas: remover em até **7 dias**
- artefatos temporários locais de backup: remover após upload e validação

Justificativa:
- `docs/BACKUPS_IMPLEMENTATION.md` define expiração após 365 dias
- `docs/BACKUPS_IMPLEMENTATION_COMPREHENSIVE.md` reforça lifecycle e retenção como boa prática

Requisitos:
- habilitar lifecycle rules em GCS/GCS
- criptografar backup storage
- manter trilha de execução e falha de backup
- executar restore drill periódico em ambiente controlado

### 5.4 Dados de tenant exportados e offboarding

Diretriz:
- exportações de tenant devem ser tratadas como dados sensíveis
- acesso deve ser limitado a operações autorizadas
- arquivos de exportação não devem ficar indefinidamente em storage temporário

Retenção padrão adotada:
- exportações para entrega operacional/offboarding: **30 dias** após disponibilização
- após esse prazo, remover de áreas temporárias e manter somente registros mínimos de auditoria

Justificativa:
- o checklist menciona exportação e offboarding de tenant, mas sem política consolidada de retenção
- 30 dias reduz exposição sem impedir operação administrativa imediata

### 5.5 Dados de auditoria

Diretriz:
- eventos de auditoria devem ser imutáveis sempre que possível
- alterações e exclusões devem ser proibidas para logs de auditoria mantidos pelo sistema

Retenção padrão adotada:
- trilhas de auditoria aplicacionais: **180 dias**, salvo exigência superior

Justificativa:
- `firestore.rules` define `audit_logs` sem update/delete
- esse tipo de trilha exige retenção maior que logs operacionais comuns

## 6. Política de descarte seguro

### 6.1 Descarte lógico
- aplicar lifecycle policy em buckets
- remover artefatos temporários de exportação, dump e processamento
- remover cache e cópias auxiliares expiradas
- revogar credenciais associadas a dados descartados quando aplicável

### 6.2 Descarte de segredos
- segredos expostos ou desnecessários devem ser rotacionados e revogados
- arquivos locais contendo segredos devem ser eliminados de estações e runners quando não forem mais necessários

### 6.3 Descarte de dados de tenant
- seguir fluxo formal de offboarding
- exportar quando exigido
- revogar acesso
- excluir dados conforme regra contratual e regulatória aplicável
- manter apenas evidência mínima de auditoria e atendimento da solicitação

## 7. Controles mínimos obrigatórios

1. criptografia em repouso para backups e stores de dados sensíveis
2. TLS obrigatório em transferências
3. acesso por menor privilégio
4. segregação entre development, staging e production
5. revisão periódica de retenção e custos
6. restore test periódico de backup
7. sanitização de logs e error tracking
8. trilha de auditoria para operações críticas

## 8. Responsabilidades

### Engenharia
- implementar retenção em serviços, buckets e plataformas de observabilidade
- evitar logging de dados sensíveis
- manter automações de backup e descarte

### DevOps / Plataforma
- configurar lifecycle rules, storage encryption e acessos
- manter monitoramento de falhas de backup
- validar retenção em Cloud Logging, GCS, GCS e ferramentas externas

### Segurança / Compliance
- revisar prazos e exceções regulatórias
- validar aderência à minimização de dados
- auditar evidências de descarte e restore

## 9. Gaps ainda existentes

- retenção de logs ainda não está consolidada de forma única no restante da documentação
- parte dos itens de observabilidade e retenção aparece como parcial no checklist interno
- restore tests e plano de DR precisam de evidência operacional recorrente
- regras específicas por categoria de dado pessoal ainda precisam ser refinadas para LGPD

## 10. Ações imediatas recomendadas

1. padronizar retenção de logs na infraestrutura para os prazos desta política
2. configurar lifecycle rules verificáveis para backup e exportações temporárias
3. validar que logs e Sentry não recebem segredo ou token sensível
4. instituir rotina de restore drill com evidência
5. vincular esta política ao kit de compliance e aos runbooks operacionais

## 11. Vigência

Esta política passa a ser a referência documental consolidada do repositório para retenção de logs, backups e descarte de dados, até substituição por política corporativa aprovada.
