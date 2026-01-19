# PowerShell script para setup do ambiente

Write-Host "🚀 Configurando ambiente de desenvolvimento T3CK..." -ForegroundColor Green

# Verificar pré-requisitos
Write-Host "📋 Verificando pré-requisitos..." -ForegroundColor Yellow

$prerequisites = @{
    "Node.js" = "node"
    "pnpm" = "pnpm"
    "Terraform" = "terraform"
    "AWS CLI" = "aws"
    "Docker" = "docker"
}

foreach ($name in $prerequisites.Keys) {
    $command = $prerequisites[$name]
    if (Get-Command $command -ErrorAction SilentlyContinue) {
        Write-Host "✅ $name encontrado" -ForegroundColor Green
    } else {
        if ($name -eq "Node.js" -or $name -eq "pnpm") {
            Write-Host "❌ $name não encontrado. Instale antes de continuar." -ForegroundColor Red
            exit 1
        } else {
            Write-Host "⚠️  $name não encontrado. Instale para funcionalidade completa." -ForegroundColor Yellow
        }
    }
}

# Instalar dependências
Write-Host "📦 Instalando dependências..." -ForegroundColor Yellow
pnpm install

# Copiar arquivo .env.example se .env não existir
if (-not (Test-Path .env)) {
    Write-Host "📝 Criando arquivo .env a partir de .env.example..." -ForegroundColor Yellow
    Copy-Item .env.example .env
    Write-Host "⚠️  Configure as variáveis de ambiente no arquivo .env" -ForegroundColor Yellow
}

# Build
Write-Host "🔨 Fazendo build dos pacotes..." -ForegroundColor Yellow
pnpm build

Write-Host "✅ Setup concluído!" -ForegroundColor Green
Write-Host ""
Write-Host "Próximos passos:"
Write-Host "1. Configure o arquivo .env com suas credenciais"
Write-Host "2. Configure AWS CLI: aws configure"
Write-Host "3. Configure Firebase CLI: firebase login"
Write-Host "4. Execute os testes: pnpm test"
Write-Host "5. Inicie os serviços: pnpm dev"
