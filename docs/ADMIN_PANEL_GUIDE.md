# Admin Panel - Painel de Gerenciamento de Tenants

## 🎯 Visão Geral

O **Admin Panel** é uma interface web moderna para gerenciar o provisionamento de tenants no sistema T3CK Core. Permite criar, monitorar e consultar o status de provisionamento de novos tenants em tempo real.

## 🚀 Acesso Rápido

- **URL**: http://localhost:8080/ADMIN_PANEL.html
- **API Backend**: http://localhost:3003
- **Demo Dashboard**: http://localhost:8080/DEMO_FULL.html

## 📋 Funcionalidades

### 1. 📝 Formulário de Provisionamento

Permite criar um novo tenant com os seguintes campos:

| Campo | Tipo | Validação | Obrigatório |
|-------|------|-----------|------------|
| **Tenant ID** | Texto | Alfanumérico + hífens (3-50 chars) | ✅ |
| **Empresa** | Texto | Mín. 3 caracteres | ✅ |
| **Domain** | Texto | Formato válido (ex: empresa.t3ck.com) | ✅ |
| **Email Contato** | Email | RFC 5322 | ✅ |
| **Nome Contato** | Texto | Qualquer texto | ✅ |
| **Assentos** | Número | 1-10000 | ✅ |
| **Região** | Select | us-east-1, us-west-2, eu-west-1, ap-southeast-1 | ✅ |

**Fluxo de Submissão**:
```
Usuário preenche formulário
      ↓
Validação local (frontend)
      ↓
POST /provisioning/submit
      ↓
Sucesso → Limpa form + Refresh stats
Erro → Mostra mensagem de erro
```

### 2. 📊 Estatísticas em Tempo Real

Exibe 4 cards com métricas da fila de provisionamento:

```
┌─────────────┬──────────────┬──────────────┬──────────────┐
│  Aguardando │ Em Processo  │ Concluídos   │ Falhados     │
│     3       │      1       │    127       │      2       │
│    📋       │      ⚙️       │     ✅       │      ❌       │
└─────────────┴──────────────┴──────────────┴──────────────┘
```

**Atualização**: Clique em "Atualizar" ou aguarde refresh automático a cada 30s.

### 3. 🔍 Busca de Status

Permite consultar o status de um tenant específico:

1. Digite o ID do tenant
2. Clique "Buscar Status" ou pressione Enter
3. Veja os detalhes:
   - ID e nome da empresa
   - Domain
   - Status atual (PENDING, PROVISIONING, ACTIVE, etc)
   - Data de criação
   - Data de provisionamento (se concluído)
   - Job ID

**Exemplo de Status**:
```
ID: empresa-acme-001
Empresa: ACME Corp
Domain: acme.t3ck.com
Status: PROVISIONING ⚙️
Criado: 19/12/2024, 10:30:00
Job: job-uuid-12345
```

### 4. 📋 Lista de Tenants

Exibe todos os tenants cadastrados com:
- Nome da empresa
- ID
- Domain
- Data de criação
- Status com badge colorido
- Botão para visualizar detalhes

---

## 🎨 Design e Interface

### Cores
- **Fundo**: Branco limpo
- **Tema Principal**: Roxo (gradient)
- **Sucesso**: Verde (#28a745)
- **Erro**: Vermelho (#dc3545)
- **Info**: Azul (#007bff)

### Responsividade
- ✅ Mobile (480px+)
- ✅ Tablet (768px+)
- ✅ Desktop (1024px+)
- ✅ Large (1920px+)

### Componentes
- Cards com sombra e hover
- Badges coloridos por status
- Input com validação visual
- Buttons com loading state
- Modal para detalhes
- Loading spinner

---

## 💻 Como Usar

### Cenário 1: Criar um Novo Tenant

```
1. Abrir Admin Panel
   → http://localhost:8080/ADMIN_PANEL.html

2. Preencher formulário:
   ├─ Tenant ID: acme-corp-001
   ├─ Empresa: ACME Corporation
   ├─ Domain: acme.t3ck.com
   ├─ Email: admin@acme.com
   ├─ Contato: João Silva
   ├─ Assentos: 100
   └─ Região: us-east-1

3. Clicar "PROVISIONAR"
   → Validação local
   → POST para /provisioning/submit
   → Sucesso! Job criado

4. Ver status em tempo real
   → Stats atualizam
   → Tenant aparece na lista
```

### Cenário 2: Monitorar Tenant em Provisionamento

```
1. Buscar o tenant:
   ├─ Digite: acme-corp-001
   └─ Clique: "Buscar Status"

2. Ver informações:
   ├─ Status: PROVISIONING ⚙️
   ├─ Criado: 19/12/2024 10:30
   └─ Job: job-uuid-12345

3. Aguardar conclusão
   ├─ Status muda para ACTIVE ✅
   ├─ Data de provisionamento preenchida
   └─ Tenant pronto para uso
```

### Cenário 3: Consultar Stats da Fila

```
1. Abrir Admin Panel
2. Ver cards com métricas:
   ├─ Aguardando: 3
   ├─ Em Processo: 1
   ├─ Concluídos: 127
   └─ Falhados: 2

3. Clicar "Atualizar" para refresh manual
4. Ou aguardar atualização automática
```

---

## 🔌 Integração com API

### Requisições Feitas

O Admin Panel faz requisições para:

#### 1. POST /provisioning/submit
```javascript
fetch('http://localhost:3003/provisioning/submit', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    tenantId: 'acme-corp-001',
    companyName: 'ACME Corporation',
    domain: 'acme.t3ck.com',
    contactEmail: 'admin@acme.com',
    contactName: 'João Silva',
    numberOfSeats: 100,
    region: 'us-east-1'
  })
})
```

#### 2. GET /queue/stats
```javascript
fetch('http://localhost:3003/queue/stats')
  .then(r => r.json())
  .then(data => {
    // { waiting: 3, active: 1, completed: 127, failed: 2 }
  })
```

#### 3. GET /provisioning/:tenantId/status
```javascript
fetch('http://localhost:3003/provisioning/acme-corp-001/status')
  .then(r => r.json())
  .then(data => {
    // { success: true, data: { tenantId, status, ... } }
  })
```

---

## ⚙️ Configuração

### Variáveis Internas

No arquivo `ADMIN_PANEL.html`:

```javascript
const API_BASE_URL = 'http://localhost:3003';
// Alterar para produção:
// const API_BASE_URL = 'https://api.t3ck.com';
```

### CORS

Se receber erro de CORS, configurar no backend:

```javascript
// services/tenant-service/src/index.ts
app.use(cors({
  origin: 'http://localhost:8080',
  credentials: true
}));
```

---

## 🐛 Troubleshooting

### Erro: "ERR_NAME_NOT_RESOLVED"

**Problema**: Não consegue conectar ao servidor

**Solução**:
```bash
# Verificar se servidor está rodando
curl http://localhost:3003/health

# Se não responder, iniciar:
cd services/tenant-service
pnpm start
```

### Erro: "Cannot read properties of undefined"

**Problema**: Stats não carregam

**Solução**:
1. Abrir Console do navegador (F12)
2. Verificar mensagens de erro
3. Garantir que `/queue/stats` retorna JSON válido
4. Recarregar página

### Erro: "Tenant not found"

**Problema**: Busca retorna vazio

**Solução**:
- Verificar ID do tenant (case-sensitive)
- Garantir que tenant foi criado (check no banco)
- Tentar ID de um tenant que você sabe que existe

### Formulário não valida

**Problema**: Campo permite entrada inválida

**Solução**:
1. F12 → Console
2. Verificar se validação está rodando
3. Testar valores de exemplo:
   - ID: `test-tenant-001`
   - Email: `test@example.com`
   - Assentos: `50`

---

## 📱 Mobile Experience

### Breakpoints

- **Pequeno (< 480px)**: Single column, stack vertical
- **Médio (480-768px)**: 2 columns para cards
- **Grande (> 768px)**: Full layout com sidebars

### Otimizações Mobile

- Touch-friendly buttons (min 44px)
- Fonte legível sem zoom
- Inputs largos (full width)
- Modals adaptados para tela pequena

---

## 🔐 Segurança

### Validações no Frontend

1. **Campos obrigatórios**: Checked antes de submeter
2. **Formato de email**: Regex validation
3. **Tenant ID**: Alfanumérico + hífens
4. **Assentos**: Número inteiro positivo

### CORS

- ✅ Bloqueado para cross-origin (a menos que configurado)
- ✅ Credentials não incluídos por padrão
- ✅ Safe methods apenas (GET, POST)

### Dados Sensíveis

- ❌ Não armazena credentials localmente
- ❌ Não usa localStorage para tokens
- ❌ Todas as requisições via HTTPS em produção

---

## 📊 Exemplo Completo

### Passo a Passo: Provisionar 3 Tenants

```
01. Abrir Admin Panel
    URL: http://localhost:8080/ADMIN_PANEL.html

02. Primeiro Tenant:
    ├─ Tenant ID: startup-tech-001
    ├─ Empresa: StartupTech
    ├─ Domain: startuptech.t3ck.com
    ├─ Email: hello@startuptech.com
    ├─ Contato: Alice
    ├─ Assentos: 10
    ├─ Região: us-east-1
    └─ Clicar: PROVISIONAR ✅

03. Ver Sucesso:
    ├─ Mensagem: "Tenant criado com sucesso!"
    ├─ Job ID: job-uuid-12345
    ├─ Form limpo
    └─ Stats atualizado

04. Segundo Tenant:
    ├─ Repetir processo com dados diferentes
    ├─ Tenant ID: ecommerce-plus-001
    ├─ Empresa: EcommercePlus
    └─ Clicar: PROVISIONAR ✅

05. Terceiro Tenant:
    ├─ Repetir processo
    ├─ Tenant ID: agency-design-001
    ├─ Empresa: Agency Design
    └─ Clicar: PROVISIONAR ✅

06. Monitorar Stats:
    ├─ Aguardando: 3 (ou menos se processando)
    ├─ Em Processo: 1 ou 2
    ├─ Concluídos: cresce conforme termina
    └─ Clicar "Atualizar" a cada 10s

07. Conferir Status Individual:
    ├─ Buscar: startup-tech-001
    ├─ Ver: PROVISIONING → ACTIVE
    ├─ Verificar Job ID e timestamps
    └─ Confirmar sucesso

08. Dashboard:
    └─ Lista de tenants atualiza em tempo real
```

---

## 🎓 Dicas & Tricks

### Atalhos de Teclado

| Tecla | Ação |
|-------|------|
| `Enter` | Enviar formulário ou buscar status |
| `F12` | Abrir Developer Tools |
| `Ctrl+Shift+K` | Abrir Console |

### Desenvolvimento Local

```javascript
// Testar requisições manualmente
curl -X POST http://localhost:3003/provisioning/submit \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "test-001",
    "companyName": "Test Co",
    "domain": "test.t3ck.com",
    "contactEmail": "test@test.com",
    "contactName": "Tester",
    "numberOfSeats": 5,
    "region": "us-east-1"
  }'
```

### Debug Console

```javascript
// No console do navegador (F12)
console.log(API_BASE_URL)
// Verifica se API_BASE_URL está correto

// Testar fetch
fetch('http://localhost:3003/queue/stats')
  .then(r => r.json())
  .then(console.log)
```

---

## 🚀 Deployment

### Produção

```html
<!-- Atualizar em ADMIN_PANEL.html -->
<script>
  const API_BASE_URL = 'https://api.t3ck.com'; // Produção
  // const API_BASE_URL = 'http://localhost:3003'; // Dev
</script>
```

### CDN

```html
<!-- Servir via CloudFront/Cloudflare -->
<link rel="stylesheet" href="https://cdn.t3ck.com/admin-panel.css">
<script src="https://cdn.t3ck.com/admin-panel.js"></script>
```

---

## 📞 Suporte

Problemas?

1. ✅ Verificar if servidor está rodando: `curl http://localhost:3003/health`
2. ✅ Abrir Console (F12) e procurar erros
3. ✅ Recarregar página (Ctrl+Shift+R hard refresh)
4. ✅ Checar logs: `tail -f logs/provisioning.log`

---

**Última atualização**: 19 de Dezembro de 2024  
**Versão**: 1.0.0  
**Status**: ✅ Produção Pronta
