# 👨‍💻 GUIA PARA DESENVOLVEDORES - Semana 3

## 📍 Você Está Aqui

Semana 3 está **100% completa**. Este documento guia novos devs a entender e contribuir ao projeto.

---

## 🎯 Começar a Trabalhar

### 1. Clonar/Navegar ao Projeto
```bash
cd "c:\Users\erick\Desktop\T3CK Core"
```

### 2. Entender a Estrutura
```
T3CK Core/
├── docs/                          # Documentação (7 arquivos)
├── services/
│   └── tenant-service/            # Main service
│       ├── src/
│       │   ├── index.ts          # Entry point + Express app
│       │   ├── provisioning-form.ts
│       │   └── __tests__/        # 36 testes
│       └── package.json
├── scripts/
│   ├── server.js                 # Demo web server
│   └── setup.sh/ps1              # Setup scripts
└── SEMANA3_README.md
```

### 3. Instalar Dependências
```bash
# Globalmente
pnpm install -g pnpm@latest

# Projeto
cd services/tenant-service
pnpm install
```

### 4. Entender a Arquitetura

```
HTTP Request
    ↓
Express API (index.ts)
    ↓
Form Validation (provisioning-form.ts)
    ↓
Database (TypeORM)
    ↓
Bull Queue (2 workers)
    ↓
AWS Step Functions (simulated)
    ↓
Status Updated in DB
    ↓
Client sees ACTIVE ✅
```

---

## 🏗️ Estrutura de Código

### services/tenant-service/src/index.ts

Arquivo principal com:

```typescript
// 1. Express setup
const app = express();
app.use(express.json());
app.use(cors());

// 2. API Endpoints
POST /provisioning/submit    // Criar tenant
GET  /provisioning/:id/status // Consultar status
GET  /queue/stats            // Ver fila
GET  /metrics                // Prometheus

// 3. Bull Queue setup
const provisioningQueue = new Queue('provisioning', {
  connection: redisConnection
});

// 4. Queue worker (2 concurrent)
provisioningQueue.process(2, async (job) => {
  // Process provisioning
});
```

### Fluxo de Requisição

```
1. POST /provisioning/submit
   ├─ Validar dados (ProvisioningFormService)
   ├─ Salvar tenant no DB
   ├─ Criar job na fila
   └─ Retornar sucesso

2. Queue worker processa
   ├─ Pega job de PENDING
   ├─ Muda para PROVISIONING
   ├─ Chama AWS (simulated)
   └─ Muda para ACTIVE

3. GET /provisioning/:id/status
   ├─ Busca tenant no DB
   └─ Retorna status atual
```

---

## 📝 Como Contribuir

### Adicionando uma Nova Feature

#### Exemplo: Adicionar email notification

```typescript
// 1. Criar novo serviço
// services/tenant-service/src/notification-service.ts

export class NotificationService {
  async sendProvisioningEmail(tenant: Tenant) {
    // Implementação
  }
}

// 2. Integrar no index.ts
import { NotificationService } from './notification-service';

const notificationService = new NotificationService();

// No queue worker:
await notificationService.sendProvisioningEmail(tenant);

// 3. Adicionar testes
// services/tenant-service/src/__tests__/notification.test.ts

describe('NotificationService', () => {
  it('should send email on provision complete', () => {
    // Test
  });
});

// 4. Documentar em docs/
// Adicionar seção em ADMIN_PANEL_GUIDE.md

// 5. Rodar testes
pnpm test

// 6. Commit
git add .
git commit -m "feat: add email notification on tenant provisioning"
```

### Code Style

```typescript
// ✅ BOAS PRÁTICAS

// 1. Use tipos TypeScript
function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// 2. Use async/await (não promises)
async function createTenant(data: TenantData) {
  const tenant = await db.save(data);
  return tenant;
}

// 3. Handle errors
try {
  await tenant.save();
} catch (error) {
  throw new ValidationError(`Failed to save: ${error.message}`);
}

// 4. Use meaningful names
async function processProvisioningJob() {}  // ✅
async function process() {}                 // ❌

// 5. Add JSDoc comments
/**
 * Validate tenant provisioning form data
 * @param formData - Raw form data from user
 * @returns Validation result with errors array
 */
function validateForm(formData: any): ValidationResult {}
```

---

## 🧪 Testando

### Rodar Testes

```bash
# Todos
pnpm test

# Específico
pnpm test provisioning-form.test.ts

# Watch mode
pnpm test --watch

# Coverage
pnpm test --coverage

# Verbose output
pnpm test --verbose
```

### Estrutura de Teste

```typescript
describe('ProvisioningFormService', () => {
  it('should validate correct form data', () => {
    const formData = {
      tenantId: 'test-001',
      companyName: 'Test Company',
      domain: 'test.t3ck.com',
      contactEmail: 'admin@test.com',
      contactName: 'Admin',
      numberOfSeats: 50,
      region: 'us-east-1'
    };
    
    const result = service.validateProvisioningForm(formData);
    
    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('should fail with duplicate tenantId', () => {
    // Test
  });
});
```

### Adicionando um Novo Teste

```typescript
// 1. Abrir arquivo de teste
// services/tenant-service/src/__tests__/provisioning-form.test.ts

// 2. Adicionar novo test case
it('should validate numberOfSeats range', () => {
  const validData = { ...baseData, numberOfSeats: 100 };
  const result = service.validateProvisioningForm(validData);
  expect(result.success).toBe(true);

  const tooSmall = { ...baseData, numberOfSeats: 0 };
  const result2 = service.validateProvisioningForm(tooSmall);
  expect(result2.success).toBe(false);
});

// 3. Rodar testes
pnpm test provisioning-form.test.ts

// 4. Commit
git add .
git commit -m "test: add numberOfSeats validation test"
```

---

## 🐛 Debugging

### Debug Mode

```bash
# Com Node debugger
node --inspect services/tenant-service/src/index.ts

# Com VSCode debugger
# Launch config em .vscode/launch.json
{
  "type": "node",
  "request": "launch",
  "program": "${workspaceFolder}/services/tenant-service/src/index.ts"
}
```

### Ver Logs

```bash
# Terminal do serviço
# Logs aparecem automaticamente:
[2024-12-19T10:30:00Z] POST /provisioning/submit
[2024-12-19T10:30:01Z] Tenant saved: test-001
[2024-12-19T10:30:02Z] Queue job created: job-uuid

# Ou ver arquivo de log
tail -f logs/provisioning.log
```

### Comum Problemas

| Erro | Causa | Solução |
|------|-------|---------|
| `Cannot connect to database` | MySQL down | `mysql.server start` ou `systemctl start mysql` |
| `EADDRINUSE` | Porta em uso | Mudar porta em `package.json` |
| `Queue worker not processing` | Redis down | Checar Redis está rodando |
| `TypeError: db is undefined` | Imports incorretos | Checar imports em index.ts |

---

## 📚 Documentação para Devs

### Leia Primeiro
1. [ARCHITECTURE.md](./docs/ARCHITECTURE.md) - Entender design
2. [API.md](./docs/API.md) - Endpoints disponíveis
3. [PROVISIONING.md](./docs/PROVISIONING.md) - Fluxo
4. [ADMIN_PANEL_GUIDE.md](./docs/ADMIN_PANEL_GUIDE.md) - UI/UX

### Código Existente
- `services/tenant-service/src/index.ts` - Main app
- `services/tenant-service/src/__tests__/` - Test examples
- `docs/ADMIN_PANEL.html` - Frontend code

### Adicionar Documentação

Quando adicionar feature:

```markdown
## Minha Nova Feature

### O que faz
Descrever funcionalidade

### Como usar
Exemplos de código

### API
Endpoints criados/modificados

### Testes
Testes adicionados

### Exemplo
```bash
curl -X POST http://localhost:3003/new-endpoint
```
```

---

## 🚀 Deploy Checklist

Antes de fazer push:

```
[ ] Código compila sem erros
[ ] Todos testes passam (36/36)
[ ] Coverage > 90%
[ ] Documentação atualizada
[ ] Nenhuma console.error
[ ] TypeScript strict mode passa
[ ] Sem breaking changes
[ ] PR criado e reviewado
```

### Fazer Deploy

```bash
# 1. Build
pnpm build

# 2. Testes
pnpm test

# 3. Lint
pnpm lint

# 4. Push
git add .
git commit -m "feat: my feature"
git push origin main

# 5. Deploy (automático via CI/CD)
```

---

## 💡 Dicas & Tricks

### VSCode Extensions Recomendadas

```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "ms-vscode.extension-test-runner",
    "TypeScript.vscode-typescript-next",
    "bradlc.vscode-tailwindcss"
  ]
}
```

### Atalhos Úteis

| Comando | VSCode |
|---------|--------|
| Format code | Shift+Alt+F |
| Quick fix | Ctrl+. |
| Go to definition | F12 |
| Find references | Shift+F12 |
| Run tests | Ctrl+Shift+D |

### Scripts Úteis

```bash
# Reinstalar dependências
rm -rf node_modules pnpm-lock.yaml
pnpm install

# Limpar cache
pnpm store prune

# Atualizar dependências
pnpm update

# Verificar tipos
pnpm exec tsc --noEmit

# Run with watch
pnpm start:watch
```

---

## 🔄 Git Workflow

### Criar Nova Branch

```bash
git checkout -b feature/minha-feature
git add .
git commit -m "feat: add minha feature"
git push origin feature/minha-feature

# Criar PR no GitHub
# Review → Approve → Merge
```

### Commit Messages

```
✅ BOM:
feat: add email notifications for provisioning
fix: handle race condition in queue worker
test: add coverage for validation service
docs: update API documentation
refactor: simplify database queries

❌ RUIM:
fixed stuff
update code
changes
asdfgh
```

---

## 📊 Performance Tips

### Database Queries

```typescript
// ❌ RUIM - N+1 problem
const tenants = await getTenants();
for (const tenant of tenants) {
  const jobs = await getJobs(tenant.id);  // N queries!
}

// ✅ BOM - Single query with join
const tenants = await getTenantsWithJobs();
```

### Queue Processing

```typescript
// ❌ RUIM - Processamento sequencial
for (const tenant of tenants) {
  await processProvisioning(tenant);
}

// ✅ BOM - Paralelo
await Promise.all(
  tenants.map(t => processProvisioning(t))
);
```

### Caching

```typescript
// ❌ RUIM - Sem cache
const status = await getTenantStatus(id);  // DB query

// ✅ BOM - Com cache
const cached = await cache.get(id);
if (cached) return cached;
const status = await getTenantStatus(id);
await cache.set(id, status, 60); // 60s TTL
```

---

## 🔐 Segurança

### Validação de Input

```typescript
// ✅ SEMPRE validar input
export function validateTenantId(id: string): boolean {
  return /^[a-z0-9-]{3,50}$/.test(id);
}

// Usar em endpoints
app.post('/provisioning/submit', (req, res) => {
  if (!validateTenantId(req.body.tenantId)) {
    return res.status(400).json({ error: 'Invalid ID' });
  }
  // Process
});
```

### Rate Limiting

```typescript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 100 // limit each IP to 100 requests per windowMs
});

app.use(limiter);
```

### CORS

```typescript
app.use(cors({
  origin: 'http://localhost:8080',
  credentials: true,
  optionsSuccessStatus: 200
}));
```

---

## 📞 Contato

Dúvidas sobre código:
- Abrir issue no repositório
- Checar documentação em `docs/`
- Olhar exemplos em `__tests__/`

---

## 🎓 Recursos Externos

- [Express.js Docs](https://expressjs.com/)
- [TypeORM Docs](https://typeorm.io/)
- [Bull Queue Docs](https://docs.bullmq.io/)
- [Jest Testing](https://jestjs.io/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

---

**Happy coding! 🚀**

Última atualização: 19 de Dezembro de 2024  
Semana: 3  
Status: ✅ COMPLETA
