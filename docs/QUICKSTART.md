# 🚀 Como Rodar Semana 3 Completa

Guia passo a passo para colocar todo o sistema em funcionamento!

## 📋 Pré-requisitos

Verifique se você tem:

```powershell
# Verificar Node.js (versão 18+)
node --version
# Esperado: v18.x.x ou superior

# Verificar npm/pnpm
npm --version
# ou
pnpm --version

# Verificar MySQL
mysql --version
# Esperado: 8.0 ou superior
```

Se não tiver algum deles, instale:

- [Node.js LTS](https://nodejs.org/)
- [MySQL Community Edition](https://dev.mysql.com/downloads/mysql/)

---

## 🎯 Quick Start (5 minutos)

### 1. Abra PowerShell e navegue até o projeto

```powershell
cd "c:\Users\erick\Desktop\T3CK Core"
```

### 2. Terminal 1: Inicie o Servidor Demo

```powershell
# No PowerShell
node scripts/server.js
```

**Você verá**:

```
Starting server on port 8080

✅ Server running at http://localhost:8080/
📊 Demo Dashboard: http://localhost:8080/DEMO_FULL.html
🏢 Admin Panel: http://localhost:8080/ADMIN_PANEL.html
🔌 API: http://localhost:8080/api/status
```

✅ **Deixe rodando!** Não feche este terminal.

### 3. Terminal 2: Inicie o Serviço de Tenant

Abra um novo PowerShell em `c:\Users\erick\Desktop\T3CK Core`:

```powershell
cd services\tenant-service
pnpm install
pnpm start
```

**Você verá**:

```
✅ Tenant service running on port 3003
✅ Database connected
✅ Bull Queue initialized
✅ Prometheus metrics available at /metrics
```

✅ **Deixe rodando!** Não feche este terminal.

### 4. Abra o Browser

Acesse uma dessas URLs:

```
Admin Panel:    http://localhost:8080/ADMIN_PANEL.html
Demo Dashboard: http://localhost:8080/DEMO_FULL.html
```

### 5. Teste Criar um Tenant! 🎉

**No Admin Panel**:

1. Preencha o formulário:
   - Tenant ID: `test-empresa-001`
   - Empresa: `Test Company`
   - Domain: `test-company.t3ck.com`
   - Email: `admin@test.com`
   - Contato: `João`
   - Assentos: `50`
   - Região: `us-east-1`

2. Clique em **PROVISIONAR**

3. Veja a mensagem de sucesso! ✅

---

## 📚 Passo a Passo Detalhado

### Passo 1: Preparar o Ambiente

```powershell
# Navegue até a pasta do projeto
cd "c:\Users\erick\Desktop\T3CK Core"

# Verifique se os arquivos existem
ls docs\ADMIN_PANEL.html
ls scripts\server.js
ls services\tenant-service\src\index.ts
```

### Passo 2: Verificar Dependências

```powershell
# Node.js deve ser 18+
node --version

# npm deve ser 8+
npm --version

# Verifique pnpm
pnpm --version
# Se não tiver, instale:
npm install -g pnpm@latest
```

### Passo 3: Validar Banco de Dados

```powershell
# Conecte ao MySQL
mysql -u root -p

# Na linha mysql> digite:
SHOW DATABASES;

# Você deve ver vários bancos incluindo 't3ck_provisioning'
# Se não existir, será criado automaticamente ao iniciar o serviço

# Saia
exit;
```

### Passo 4: Iniciar Servidor Demo

```powershell
# Nova janela do PowerShell
cd "c:\Users\erick\Desktop\T3CK Core"
node scripts\server.js
```

**Output esperado**:

```
Starting server on port 8080

✅ Server running at http://localhost:8080/
📊 Demo Dashboard: http://localhost:8080/DEMO_FULL.html
🏢 Admin Panel: http://localhost:8080/ADMIN_PANEL.html
🔌 API: http://localhost:8080/api/status
```

Se tiver erro de porta (EADDRINUSE), algo já está usando porta 8080. Edite `scripts/server.js` linha 7:

```javascript
const PORT = 8081; // Ou outra porta
```

### Passo 5: Iniciar Serviço de Tenant

```powershell
# Nova janela do PowerShell
cd "c:\Users\erick\Desktop\T3CK Core"
cd services\tenant-service
pnpm install
pnpm start
```

**Output esperado**:

```
✅ Tenant service running on port 3003
✅ Database connected
✅ Bull Queue initialized
```

Se receber erro de banco de dados:

1. Verifique que MySQL está rodando: `mysql -u root -p`
2. Verifique credenciais no `.env`
3. O banco será criado automaticamente

### Passo 6: Acessar Admin Panel

Abra navegador (Chrome, Firefox, Edge) e acesse:

```
http://localhost:8080/ADMIN_PANEL.html
```

Você verá uma página com:

- ✅ Formulário de provisionamento
- ✅ Cards de estatísticas
- ✅ Busca de status
- ✅ Lista de tenants

### Passo 7: Criar um Tenant

1. **Preencha o formulário** com dados válidos:

   ```
   Tenant ID:   empresa-001
   Empresa:     Minha Empresa
   Domain:      empresa.t3ck.com
   Email:       admin@empresa.com
   Contato:     João
   Assentos:    50
   Região:      us-east-1
   ```

2. **Clique PROVISIONAR**

3. **Veja a confirmação**:

   ```
   ✅ Tenant "Minha Empresa" criado com sucesso!
   Job ID: job-uuid-12345
   ```

4. **Monitore o progresso**:
   - Stats atualizam automaticamente
   - Status muda: PENDING → PROVISIONING → ACTIVE

### Passo 8: Testar a API (Opcional)

```powershell
# Buscar status do tenant
curl http://localhost:3003/provisioning/empresa-001/status

# Ver stats da fila
curl http://localhost:3003/queue/stats

# Ver métricas
curl http://localhost:3003/metrics
```

---

## 🧪 Rodar Testes

```powershell
cd services\tenant-service

# Todos os testes
pnpm test

# Apenas provisioning
pnpm test --testPathPattern=provisioning

# Com output detalhado
pnpm test --verbose

# Com coverage
pnpm test --coverage
```

**Resultado esperado**:

```
Test Suites: 3 passed, 3 total
Tests:       36 passed, 36 total
✓ Time: ~3.5s
```

---

## 📊 Acessar Dashboards

### Admin Panel

```
http://localhost:8080/ADMIN_PANEL.html
```

Use para:

- ✅ Criar novos tenants
- ✅ Consultar status
- ✅ Ver estatísticas
- ✅ Listar tenants

### Demo Dashboard

```
http://localhost:8080/DEMO_FULL.html
```

Use para:

- 📊 Visualizar sistema completo
- 📈 Ver arquitetura
- 🔌 Testar endpoints

### Métricas (Prometheus)

```
http://localhost:3003/metrics
```

### API Status

```
http://localhost:3003/health
```

---

## 🐛 Troubleshooting

### Erro: "EADDRINUSE :::8080"

**Problema**: Porta 8080 já está em uso

**Solução**:

```powershell
# Opção 1: Matar processo
netstat -ano | findstr :8080
taskkill /PID [PID] /F

# Opção 2: Usar porta diferente
# Editar scripts\server.js, linha 7
const PORT = 8081;
```

### Erro: "Cannot connect to database"

**Problema**: MySQL não está rodando ou credenciais incorretas

**Solução**:

```powershell
# Verificar MySQL
mysql -u root -p

# Se não conectar, iniciar MySQL
# Windows: Services → MySQL80 → Start
# Ou via terminal
"C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqld" --console
```

### Erro: "ECONNREFUSED localhost:3003"

**Problema**: Serviço de tenant não está rodando

**Solução**:

```powershell
# Verificar se rodando
netstat -ano | findstr :3003

# Se não, iniciar
cd services\tenant-service
pnpm start
```

### Erro: "Cannot GET /ADMIN_PANEL.html"

**Problema**: Servidor demo não encontra arquivo

**Solução**:

```powershell
# Verificar arquivo existe
ls docs\ADMIN_PANEL.html

# Verificar servidor está rodando
curl http://localhost:8080/DEMO_FULL.html

# Se não funcionar, reiniciar servidor demo
# Ctrl+C no terminal do servidor
# Rodar novamente: node scripts\server.js
```

### Erro: "Network request failed"

**Problema**: Admin Panel não consegue conectar à API

**Solução**:

1. Verificar se tenant-service está rodando: `curl http://localhost:3003/health`
2. Verificar CORS está habilitado (deve estar por padrão)
3. Recarregar página (Ctrl+Shift+R)

### Erro: "ValidationError: Validation failed"

**Problema**: Dados do formulário inválidos

**Solução**:

- Tenant ID: use apenas letras, números e hífens
- Email: use email válido (ex: test@test.com)
- Assentos: use número inteiro entre 1 e 10000
- Domain: use formato válido (ex: empresa.t3ck.com)

---

## 📈 Monitorar Execução

### Terminal 1: Servidor Demo

```
Mostra: Requisições HTTP
Quando funciona:
✅ Starting server on port 8080
✅ GET / 200
✅ GET /ADMIN_PANEL.html 200
```

### Terminal 2: Serviço de Tenant

```
Mostra: API requests, queue processing
Quando funciona:
✅ Tenant service running on port 3003
✅ POST /provisioning/submit 201
✅ Queue worker processing
```

### Browser Console (F12)

```
Mostra: JavaScript errors
Quando funciona:
✅ Nenhuma mensagem de erro
✅ Requisições aparecem na aba Network
```

---

## ✅ Checklist de Execução

```
[ ] Node.js versão 18+ instalado
[ ] MySQL rodando
[ ] Terminal 1: npm install completado
[ ] Terminal 1: node scripts/server.js executado
[ ] Terminal 2: cd services/tenant-service completado
[ ] Terminal 2: pnpm install completado
[ ] Terminal 2: pnpm start executado
[ ] http://localhost:8080/ADMIN_PANEL.html carrega
[ ] Formulário aparece no painel
[ ] Stats cards carregam
[ ] Criar tenant: sucesso ✅
[ ] Status atualiza em tempo real
[ ] Testes rodam: 36 passed
```

---

## 🎯 Próximos Passos Após Setup

### 1. Explore o Admin Panel

- Crie 3-5 tenants com dados diferentes
- Observe o fluxo: PENDING → PROVISIONING → ACTIVE
- Use busca para consultar status
- Veja estatísticas atualizarem

### 2. Rode os Testes

```powershell
cd services\tenant-service
pnpm test
```

### 3. Leia a Documentação

- [SEMANA3_SUMMARY.md](./SEMANA3_SUMMARY.md) - Visão completa
- [ADMIN_PANEL_GUIDE.md](./ADMIN_PANEL_GUIDE.md) - Como usar painel
- [API.md](./API.md) - Especificação API

### 4. Teste a API (curl ou Postman)

```powershell
# Criar tenant
curl -X POST http://localhost:3003/provisioning/submit `
  -H "Content-Type: application/json" `
  -d '{
    "tenantId": "curl-test-001",
    "companyName": "Curl Test",
    "domain": "curl-test.t3ck.com",
    "contactEmail": "test@curl.com",
    "contactName": "Tester",
    "numberOfSeats": 10,
    "region": "us-east-1"
  }'

# Ver stats
curl http://localhost:3003/queue/stats

# Ver status
curl http://localhost:3003/provisioning/curl-test-001/status
```

---

## 🎉 Sucesso!

Se você chegou aqui, tudo deve estar funcionando! 🎊

**Você tem agora:**

- ✅ Sistema completo de provisionamento
- ✅ Admin panel funcional
- ✅ 36 testes passando
- ✅ API RESTful
- ✅ Banco de dados persistente
- ✅ Fila assíncrona
- ✅ Monitoramento

**Pode agora:**

- 🏢 Provisionar novos tenants
- 📊 Monitorar progress
- 🧪 Rodar testes
- 📚 Estudar a arquitetura
- 🚀 Deploy em produção

---

## 💬 Precisa de Help?

| Problema               | Verificar                           |
| ---------------------- | ----------------------------------- |
| Porta ocupada          | `netstat -ano \| findstr :[PORT]`   |
| MySQL não conecta      | `mysql -u root -p`                  |
| Arquivo não encontrado | `ls docs\ADMIN_PANEL.html`          |
| API não responde       | `curl http://localhost:3003/health` |
| Testes falhando        | `pnpm test --verbose`               |

---

## 📝 Anotações

Deixe suas anotações aqui enquanto testa:

```
Data: _______________
Tenant criado: _______________
Status esperado: ACTIVE _______________
Problemas encontrados: _______________
Observações: _______________
```

---

**Boa sorte! 🚀**

Data: 19 de Dezembro de 2024  
Semana 3: ✅ COMPLETA

### 5. Configure Firebase

```bash
firebase login
firebase projects:list
```

## Desenvolvimento

### Rodar Serviços Localmente

```bash
# Opção 1: Usando script
./scripts/dev.sh  # Linux/macOS
.\scripts\dev.ps1 # Windows

# Opção 2: Usando pnpm
pnpm dev
```

Serviços estarão disponíveis em:

- Auth Service: http://localhost:3001
- Webhook Service: http://localhost:3002
- Tenant Service: http://localhost:3003

### Executar Testes

```bash
# Todos os testes
pnpm test

# Com coverage
pnpm test:coverage

# Watch mode
pnpm test:watch
```

### Lint e Formatação

```bash
# Verificar lint
pnpm lint

# Corrigir automaticamente
pnpm lint:fix

# Verificar formatação
pnpm format:check

# Formatar código
pnpm format
```

## Provisionamento de Tenant

### Primeira Execução

1. Configure o backend S3 do Terraform:

```bash
cd infrastructure/terraform
terraform init
```

2. Execute o script de provisionamento:

```bash
# Linux/macOS
./infrastructure/scripts/provision-tenant.sh \
  --tenant-id "test-tenant" \
  --domain "test.t3ck.com" \
  --region "us-east-1"

# Windows
.\infrastructure\scripts\provision-tenant.ps1 `
  -TenantId "test-tenant" `
  -Domain "test.t3ck.com" `
  -Region "us-east-1"
```

## Usando o SDK

```typescript
import { createT3CK } from '@t3ck/sdk';

const t3ck = createT3CK({
  apiKey: process.env.API_KEY!,
  baseUrl: 'https://api.t3ck.com',
});

// Exemplo: Adicionar produto ao carrinho
const product = {
  id: 'prod-123',
  name: 'Notebook',
  price: 2999.99,
};

await t3ck.cart.add(product, 1);
const cart = await t3ck.cart.get();
console.log(cart);
```

## Deploy

### Staging (Automático)

Push para branch `develop`:

```bash
git checkout develop
git push origin develop
```

O GitHub Actions fará deploy automático.

### Production (Manual)

1. Merge para `main`:

```bash
git checkout main
git merge develop
git push origin main
```

2. Aprovar o deploy no GitHub Actions

## Troubleshooting

### Erro: "Module not found"

Execute `pnpm install` novamente.

### Erro: "AWS credentials not found"

Configure AWS CLI: `aws configure`

### Erro: "Firebase not initialized"

Verifique se `FIREBASE_SERVICE_ACCOUNT_KEY_PATH` está configurado no `.env`.

### Serviços não iniciam

Verifique se as portas 3001, 3002, 3003 estão livres:

```bash
# Linux/macOS
lsof -i :3001

# Windows
netstat -ano | findstr :3001
```

## Próximos Passos

1. Leia [ARCHITECTURE.md](./ARCHITECTURE.md) para entender a arquitetura
2. Veja [PROVISIONING.md](./PROVISIONING.md) para detalhes de provisionamento
3. Consulte [DEPLOYMENT.md](./DEPLOYMENT.md) para guia de deploy completo
