# PowerShell script para rodar serviços em modo desenvolvimento

Write-Host "🚀 Iniciando serviços em modo desenvolvimento..." -ForegroundColor Green

# Verificar se .env existe
if (-not (Test-Path .env)) {
    Write-Host "❌ Arquivo .env não encontrado. Execute .\scripts\setup.ps1 primeiro" -ForegroundColor Red
    exit 1
}

# Carregar variáveis de ambiente
Get-Content .env | ForEach-Object {
    if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
        $name = $matches[1].Trim()
        $value = $matches[2].Trim()
        [Environment]::SetEnvironmentVariable($name, $value, 'Process')
    }
}

$authPort = if ($env:AUTH_SERVICE_PORT) { $env:AUTH_SERVICE_PORT } else { "3001" }
$webhookPort = if ($env:WEBHOOK_SERVICE_PORT) { $env:WEBHOOK_SERVICE_PORT } else { "3002" }
$tenantPort = if ($env:TENANT_SERVICE_PORT) { $env:TENANT_SERVICE_PORT } else { "3003" }

# Iniciar serviços
Write-Host "📦 Iniciando Auth Service na porta $authPort..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd services\auth-service; pnpm dev" -WindowStyle Minimized

Write-Host "📦 Iniciando Webhook Service na porta $webhookPort..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd services\webhook-service; pnpm dev" -WindowStyle Minimized

Write-Host "📦 Iniciando Tenant Service na porta $tenantPort..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd services\tenant-service; pnpm dev" -WindowStyle Minimized

Write-Host "✅ Serviços iniciados!" -ForegroundColor Green
Write-Host "Auth Service: http://localhost:$authPort"
Write-Host "Webhook Service: http://localhost:$webhookPort"
Write-Host "Tenant Service: http://localhost:$tenantPort"
Write-Host ""
Write-Host "Feche as janelas do PowerShell para parar os serviços"
