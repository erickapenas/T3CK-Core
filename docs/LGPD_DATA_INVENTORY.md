# T3CK Core — LGPD Data Inventory & Processing Basis

## Visão geral

Este documento consolida o inventário de dados pessoais coletados/processados pelo T3CK Core, a base legal de cada processamento conforme LGPD, e o fluxo de atendimento a titulares.

**Versão**: 1.0
**Última atualização**: 2026-04-06
**Próxima revisão**: Anual ou quando novo tipo de dado for coletado

**Compliance contact**: compliance@t3ck.com | +55 [XX] XXXX-XXXX

---

## 1. Visão geral do T3CK Core

T3CK Core é uma plataforma SaaS multi-tenant que fornece:
- Gerenciamento de catálogo de produtos
- Processamento de pedidos e vendas
- Integração de pagamento (Pix, Boleto, Cartão de Crédito via AbacatePay)
- Shipping e logistics
- Admin dashboard e reporting

Cada tenant (loja/empresa) usa o T3CK para armazenar e processar dados de seus próprios clientes.

---

## 2. Categorias de dados pessoais coletados

### Tipo 1: Identificadores & Contato (Titulares = Clientes finais)

**O quê?**
- Nome completo
- Email
- Número de telefone
- CPF ou CNPJ (se fornecido para documento de pagamento)
- Data de nascimento (se fornecido para validação)

**Por quê?** (Base legal)
- **Execução de contrato**: Necessário para completar compra, envio e comunicação pós-venda
- **Interesse legítimo**: Comunicações sobre pedido, suporte, notificação de envio

**Quem coleta?**
- Formulário de checkout (tenant app, integration T3CK?)
- Carrinho de compras
- Perfil de cliente

**Onde armazena?**
- Firestore (tenant-specific collection `customers`)
- Cloud SQL (redundância de dados de pedido)
- Logs de transação

**Por quanto tempo?**
- **Durante vigência de conta**: Cliente retém dados enquanto ativo/shopping
- **Pós-términoclientes amigos**: 12 meses para revisão de disputas e retenção legal
- **Exceções**: Em caso de cancelamento/exclusão, remover dentro de 30 dias

### Tipo 2: Dados de Pagamento & Cartão (Titulares = Clientes finais)

**O quê?**
- Número de cartão (primeiros 6 + últimos 4 dígitos, **NUNCA** PAN completo)
- Validade de cartão
- CVV (**nunca** armazenar - tokenizado apenas)
- Nome do titular do cartão
- Endereço de cobrança
- Histórico de transações

**Por quê?** (Base legal)
- **Execução de contrato**: Cobrança necessária para completar venda
- **Obrigação legal**: Validação anti-fraude, compliance PCI DSS

**Quem coleta?**
- Gateway de pagamento (AbacatePay, Stripe, etc.)
- Formulário de checkout (tenant app)

**Onde armazena?**
- **PAN**: NÃO está armazenado no T3CK. Tokenizado via gateway.
- **Token**: Armazenar em Secrets Manager (encrypted)
- **Histórico**: Cloud SQL com campos sensíveis masked
- **Logs**: Sanitizado de valores reais (****)

**Por quanto tempo?**
- **Tokens**: Enquanto cliente ativo; 90 dias pós-inativo
- **Histórico de transação**: 24 meses (para reembolsos, disputas)
- **Cancelado**: Se cliente request exclusão, remover tudo em 30 dias

**Aviso**: Se de fato há armazenamento de PAN, escopo PCI DSS é full. Deve-se validar com adquirente.

### Tipo 3: Localização & Endereço

**O quê?**
- Endereço de entrega (logradouro, número, complemento, CEP, cidade, estado)
- Endereço de cobrança
- GPS/localização durante checkout (se mobile app)
- IP address de transação

**Por quê?** (Base legal)
- **Execução de contrato**: Necessário para shipping
- **Interesse legítimo**: Detecção de fraude, relatório geográfico

**Onde armazena?**
- Firestore (pedido dentro de tenant collection)
- Cloud SQL (redundância)
- Cloud Logging (IP de request)

**Por quanto tempo?**
- **Ativo**: Enquanto cliente/pedido relevante
- **Histórico**: 24 meses (rastreabilidade de vendas)
- **Logs**: 90 dias (regra de retenção de logs)

### Tipo 4: Comportamento & Preferências (Titulares = Clientes finais)

**O quém?**
- Histórico de navegação do site
- Items visualizadas /adicionados ao carrinho
- Filtros e buscas realizadas
- Reviews e comentários deixados
- Preferências de comunicação (marketing, newsletters)

**Por quê?** (Base legal)
- **Consentimento opcional**: Newsletter e marketing (opt-in)
- **Interesse legítimo**: Recomendações de produto, analytics, melhoria UX

**Onde armazena?**
- Firestore (analytics collection per tenant)
- Cloud BigQuery (data warehouse para análise)
- Third-party (Mixpanel, Segment, se integrado)

**Por quanto tempo?**
- **Dados brutos**: 90 dias
- **Dados agregados**: 24 meses (para analytics histórico)
- **Cookie tracking**: Conforme política de cookies

### Tipo 5: Dados de Admin & Staff (Titulares = Usuários da plataforma)

**O quê?**
- Nome completo de usuário admin
- Email corporativo
- CPF (se solicitado para validação)
- Histórico de login e atividades administrativas
- IP address de acesso

**Por quê?** (Base legal)
- **Execução de contrato**: Necessário para gerenciar conta/tenant
- **Obrigação legal**: Auditoria de acesso a dados de clientes (LGPD compliance)

**Onde armazena?**
- Firebase Auth (gerenciado pelo Google)
- Cloud Logging (audit trails)
- Firestore (admin profile)

**Por quanto tempo?**
- **Ativo**: Enquanto usuário com acesso
- **Inativo**: 12 meses pós-término
- **Audit logs**: 3 anos (conforme padrão de retenção de logs)

**Nota**: Usuários admins têm privilégios altos; tratados com segurança reforçada.

### Tipo 6: Dados de Compliance & Suporte (Titulares = Clientes + Admin)

**O quê?**
- Emails de suporte/tickets
- Conversas de chat
- Dados anexados (screenshots, documentos)
- Feedback / surveys

**Por quê?** (Base legal)
- **Execução de contrato**: Suporte técnico necessário
- **Interesse legítimo**: Melhoria de serviço

**Onde armazena?**
- Sistema de suporte (Zendesk, Intercom, similar)
- Email arquivado
- Cloud Storage (backup de tickets)

**Por quanto tempo?**
- **Ativo**: Enquanto ticket aberto + 12 meses pós-fechamento
- **Resolvido**: 12 meses (para referência em caso de reaberta)

---

## 3. Matriz de processamento LGPD (Fluxo de dados)

| Tipo de dado | Coleta | Armazenamento | Compartilhado com | Base legal | Retenção | Direitos |
|---|---|---|---|---|---|---|
| **Identificadores** | Tenant app | Firestore | Gateway de pagamento | Execução contrato | 12m post-cliente | Acesso, Exclusão, Portabilidade |
| **Pagamento** | Gateway | Secrets Mgr + Cloud SQL | (token apenas) Adquirente | Execução contrato | 24m histórico | Acesso, Exclusão |
| **Endereço** | Checkout | Cloud SQL | Shipping provider | Execução contrato | 24m | Acesso, Exclusão |
| **Comportamento** | Analytics | BigQuery | (agregado) Marketing | Consentimento + Interesse legítimo | 90d bruto / 24m agregado | Acesso, Exclusão |
| **Admin** | Setup | Firebase Auth + Cloud Logging | (audit trail) Security | Execução contrato | 12m inativo / 3a audit | Acesso, Exclusão |
| **Suporte** | Zendesk | Cloud Storage | Arquivos cliente | Interesse legítimo | 12m | Acesso, Exclusão |

---

## 4. Subprocessadores e Compartilhamento

| Processador | Função | Dados | DPA | Localização |
|---|---|---|---|---|
| **Google Cloud Platform** | Hospedagem | Todos | Sim (Master) | Global |
| **Firebase (Google)** | Auth + Firestore | Ident, Admin | Sim | Global |
| **AbacatePay** | Gateway de pagamento | Pagamento (tokenizado) | Sim (requerido) | Brasil |
| **Stripe/Adquirente** | Processamento de cartão | Token de cartão | Sim (requerido) | EUA / Global |
| **Shipping provider** | Logística | Endereço, Ident | Sim (requerido) | Brasil / parceiro |
| **Sentry** | Error tracking | (Sanitizado, sem PII) | Sim | Global |
| **Datadog/Monitoring** | Observabilidade | (Agregado) | Sim | Global |

**Nota**: Cada novo subprocessador requer DPA antes de integração.

---

## 5. Direitos dos titulares e fluxo de atendimento

### 5.1 Direito de Acesso (Art. 18, LGPD)

**O que é**: Titular pode solicitar cópia de todos dados pessoais processados

**Fluxo**:

Solicitação (email compliance@t3ck.com):

```
Prezados,

Solicito acesso a todos meus dados pessoais armazenados no T3CK Core.

Meu email: [EMAIL]
Meu CPF (opcional): [CPF]
Data pedido: [DATA]
```

**Tempo de resposta**: Até 15 dias úteis

**Resposta**:
1. Confirmar identidade (2º fator de autenticação ou validação de dados)
2. Preparar export em JSON/CSV de toda informação pessoal
3. Enviar de forma segura (HTTPS link + senha, ou encrypted file)
4. Manter log de atendimento
5. Informar localidades de armazenamento (GCP, Cloud SQL, etc.)

**Tecnicamente**:
```
POST /api/v1/dsar/access-request
{
  "email": "customer@example.com",
  "request_type": "access_export",
  "format": "json"
}

Resposta: Link para download seguro + confirmação de recebimento
```

### 5.2 Direito de Retificação (Art. 19, LGPD)

**O que é**: Titular pode corrigir dados incorretos

**Fluxo**:

1. Solicitar via app (self-service) ou email
2. T3CK Core permite edição de identificadores, endereços, preferências
3. Tenant notificado de mudança
4. Audit log registra mudança
5. Responder em 15 dias úteis

**Tecnicamente**:
- Campo editável em perfil de customer (app)
- Valida duração de edição (não pode alterar histórico de pedido já completo)

### 5.3 Direito de Exclusão (Art. 17, LGPD - "Direito ao Esquecimento")

**O que é**: Titular pode solicitar remoção de dados

**Fluxo**:

1. Solicitar via email ou app
2. Validar se há motivo legítimo para exclusão:
   - ✓ Dados não mais necessários
   - ✓ Titular não consentiu mais
   - ✓ Objeção ao processamento
   - ✗ Dados necessários para cumprir contrato (retenção legal: 24m mínimo)
3. Se aprovado:
   - Marcar registro como "deletado" (soft delete)
   - Remover dados de backups futuros
   - Excluir de Cloud Storage em 30 dias
   - Manter só audit log mínimo (quem deletou, quando)
4. Se rejeitado:
   - Informar ao titular razão legal (ex: retenção contratual)
   - Permitir direito de portabilidade como alternativa

**Exceções para exclusão**:
- Dados de transação (PCI, auditoria, anti-fraude) - retenção legal 24 meses
- Audit logs - retenção obrigatória 3 anos
- Obrigações legais (fiscais, SEFAZ) - conforme exigência

### 5.4 Direito de Portabilidade (Art. 20, LGPD)

**O que é**: Titular pode solicitar dados em formato portável para migração

**Fluxo**:

1. Solicitar via email compliance@t3ck.com
2. T3CK prepara export em formato estruturado (JSON recomendado)
3. Incluir: Identificadores, histórico de pedidos, preferências
4. Encriptar, enviar por link seguro com prazo de 15 dias
5. Manter log de entrega

**Tecnicamente**:
```json
{
  "customer": {
    "id": "cust_123",
    "email": "customer@example.com",
    "name": "Full Name",
    "phone": "11999999999"
  },
  "orders": [
    {"order_id": "ord_456", "date": "2026-01-15", "items": [...]},
    ...
  ],
  "preferences": {
    "newsletter": true,
    "marketing": false
  }
}
```

### 5.5 Direito de Objeção (Art. 21, LGPD)

**O que é**: Titular pode se opor ao processamento

**Fluxo**:

1. Solicitar via email
2. Se objeção é:
   - **Marketing**: Parar envio imediato, atualizar preferência
   - **Processamento general**: Avaliar de faz sentido continuar
3. Responder em 15 dias

---

## 6. Política de retenção por tipo de dado

| Dado | Ativo | Pós-cliente/Eleição | Legal/Audit | Total |
|---|---|---|---|---|
| **Identificadores** | Indeterminado | 12 meses | — | 12m post |
| **Pagamento/Cartão** | Indeterminado | 24 meses | — | 24m post |
| **Endereço/Entrega** | Indeterminado | 24 meses | — | 24m post |
| **Histórico de pedido** | Indeterminado | 24 meses | — | 24m post |
| **Comportamento/Analytics** | 90 dias brutos | 24m agregado | — | 24m agregado |
| **Audit logs** | Indeterminado | Indeterminado | **3 anos mínimo** | 3a |
| **Suporte/Chat** | Indeterminado | 12 meses | — | 12m post |

---

## 7. Processadores e DPA (Data Processing Agreement)

Modelo de DPA para assinar com processadores:

```markdown
# Data Processing Agreement - T3CK Core

Este DPA regula o processamento de dados pessoais entre:
- CONTROLADOR: [Tenant / Cliente T3CK]
- PROCESSADOR: [Subprocessador, ex: Google Cloud Platform]

## Escopo
O Processador irá processar dados pessoais conforme LGPD no serviço [X] (ex: hosting, analytics)

## Obrigações do Processador
1. Tratar dados apenas conforme instruções do Controlador
2. Implementar segurança apropriada (criptografia, backup, access control)
3. Notificar Controlador em caso de incidente
4. Permitir auditorias de conformidade
5. Subordenar processamento a termos LGPD

## Direito de auditoria
Controlador pode auditar práticas de segurança anualmente

## Vigência
[Data] até encerramento de serviço

Assinado: [Processador] em [Data]
```

**Status**:
- [x] GCP Master DPA assinado
- [x] Firebase DPA (via GCP)
- [ ] AbacatePay DPA (em progresso)
- [ ] Stripe/Adquirente DPA (depende de seleção)
- [ ] Zendesk DPA (se usado)

---

## 8. Privacy by Design

**Princípios implementados**:

1. **Minimização de dados**: Coleta só o necessário
   - ✓ Checkout requer nome, email, endereço
   - ✗ Não requer genero, data de nascimento (a menos que necessário)

2. **Padrão de privacidade**: Opt-out raramente, opt-in para marketing
   - Checkbox de marketing: DESMARCADO por default
   - Newsletter: DESMARCADO por default
   - Suporte email: MARCADO (necessário)

3. **Criptografia padrão**: Dados em repouso e em trânsito
   - ✓ TLS 1.2+
   - ✓ AES-256 em Firestore/BigQuery
   - ✓ Tokenização de cartão

4. **Acesso limitado**: Quem vê qual dado?
   - Tenant admin: Seus dados próprios
   - Suporte: Identificadores + Suporte logs
   - Analytics: Agregado, sem PII
   - T3CK staff: Somente para investigação autorizada

5. **Retenção limitada**: Não guardar "just in case"
   - Logs: 90 dias (não indefinite)
   - Backups: 365 dias (depois delete)
   - Deletado: Remover em 30 dias

---

## 9. Notificação de Incidente (Art. 33, LGPD)

Se há suspeita de vazamento de dados pessoais:

1. **Avaliar risco dentro de 48 horas**:
   - Quais dados? (tipo, sensibilidade)
   - Quantas pessoas? (scale)
   - Hackeado ou apenas acesso indevido?

2. **Se risco baixo** (ex: anonymized data):
   - Documentar incidente
   - Notificar internamente
   - Sem notificação ao titular necessária

3. **Se risco alto** (ex: PII exposto):
   - Notificar autoridade (ANPD) em até 10 dias
   - Notificar titulares em linguagem clara
   - Informar: O quê, quando, como, medidas tomadas

4. **Template de notificação ao titular**:

```
Prezado(a) [Nome],

Informamos que identificamos um incidente de segurança que afetou seus
dados pessoais no serviço T3CK Core.

O incidente: [DESCRIÇÃO BREVE]
Dados afetados: [TIPO]
Data do incidente: [DATA]

Medidas tomadas: [AÇÕES]
Como você se proteger: [DICAS]
Contato: compliance@t3ck.com

Atenciosamente,
T3CK Core Compliance
```

---

## 10. Responsabilidades

| Role | Responsabilidade |
|---|---|
| **Controlador (Tenant)** | Determinar base legal, notificar titulares, respeitar direitos |
| **T3CK (Processador)** | Implementar segurança, responder DSAR, documentar processamento |
| **GCP / Subprocessador** | Segurança infraestrutura, backup, compliance técnico |
| **Compliance Officer** | Manter este inventário atualizado, auditoria periódica |

---

## 11. Auditoria e Validação

- **Anual**: Revisar categorias de dado, retenção e subprocessadores
- **Pós-incidente**: Validar segurança e controles
- **Pré-TI**: Validar Privacy Impact Assessment
- **Externo**: Auditoria de LGPD se certificação requerida

---

## 12. Aprovação

| Role | Aprovação | Data |
|---|---|---|
| DPO / Compliance Officer | ☐ | — |
| CTO | ☐ | — |
| CEO | ☐ | — |

Este documento é versão 1.0 e deve ser revisado anualmente ou quando mudança significativa ocorra.

