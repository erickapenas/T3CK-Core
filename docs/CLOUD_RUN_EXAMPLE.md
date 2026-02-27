# Cloud Run Example (Multi-tenant)

Este guia sobe uma versão funcional do T3CK Core no **Google Cloud Run** (sem AWS) para criar tenants (lojas) de exemplo.

## O que este exemplo sobe

- `tenant-service` (provisioning de tenants)
- `admin-service` (gestão administrativa básica)
- `api-gateway` (entrypoint único)

> Para simplificar o exemplo, Redis e MySQL ficam desabilitados e os dados são mantidos em memória.

## Pré-requisitos

- `gcloud` instalado e autenticado
- Projeto GCP ativo (`gcloud config set project <PROJECT_ID>`)
- Permissões para Cloud Run, Cloud Build e Artifact Registry

## Deploy automatizado

No Windows PowerShell:

```powershell
.\infrastructure\scripts\deploy-cloud-run.ps1 -ProjectId "SEU_PROJECT_ID" -Region "us-central1"
```

O script:

1. Habilita APIs necessárias
2. Cria/valida Artifact Registry
3. Builda imagens Docker via Cloud Build
4. Faz deploy no Cloud Run
5. (Opcional) Cria um tenant exemplo + produto demo

## Resultado esperado

Após o deploy, você terá:

- `Gateway URL`
- `Tenant Service URL`
- `Admin Service URL`
- `Unified Swagger` via gateway (`/api-docs-all`)

## Criar tenant manualmente (via gateway)

```bash
curl -X POST "$GATEWAY_URL/api/v1/provisioning/submit" \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "loja-exemplo-001",
    "domain": "loja-exemplo-001.demo.t3ck.local",
    "companyName": "Loja Exemplo",
    "contactName": "Owner Example",
    "plan": "starter",
    "contactEmail": "owner@example.com",
    "adminEmail": "owner@example.com",
    "numberOfSeats": 25
  }'
```

Consultar status:

```bash
curl "$GATEWAY_URL/api/v1/provisioning/loja-exemplo-001/status"
```

## Painel unificado (local) apontando para Cloud Run

```powershell
$env:VITE_GATEWAY_BASE_URL="https://SEU_GATEWAY_URL"
pnpm --filter @t3ck/admin-unified-dashboard dev
```

## Sobre multi-tenant (várias lojas)

Sim: o projeto suporta várias lojas como tenants no mesmo backend.

- Cada loja é identificada por `tenantId`
- Dados são segregados por tenant nas APIs
- O gateway encaminha rotas por domínio funcional

> Neste exemplo de Cloud Run, a persistência é em memória para facilitar o primeiro deploy. Para produção, habilite banco/redis gerenciados e secrets.
