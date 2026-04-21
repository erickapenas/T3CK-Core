param(
    [string]$ProjectId = '',
    [string]$Region = 'us-central1',
    [string]$ArtifactRepo = 't3ck-core',
    [string]$ServicePrefix = 't3ck',
    [string]$TenantId = '',
    [bool]$CreateExampleTenant = $true
)

$ErrorActionPreference = 'Stop'

function Write-Info([string]$Message) {
    Write-Host "[INFO] $Message" -ForegroundColor Cyan
}

function Write-Ok([string]$Message) {
    Write-Host "[OK] $Message" -ForegroundColor Green
}

function Write-Warn([string]$Message) {
    Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function Initialize-GcloudContext {
    if (-not $ProjectId) {
        $script:ProjectId = (gcloud config get-value project).Trim()
    }

    if (-not $ProjectId) {
        throw 'No GCP project configured. Use -ProjectId or run: gcloud config set project <PROJECT_ID>'
    }

    $activeAccount = (gcloud auth list --filter=status:ACTIVE --format='value(account)').Trim()
    if (-not $activeAccount) {
        throw 'No active gcloud account. Run: gcloud auth login'
    }

    Write-Info "Using project: $ProjectId"
    Write-Info "Using region : $Region"
    Write-Info "Active user  : $activeAccount"
}

function Initialize-ServicesEnabled {
    Write-Info 'Enabling required GCP APIs...'
    gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com --project $ProjectId | Out-Null
    Write-Ok 'Required APIs enabled'
}

function Initialize-ArtifactRepository {
    Write-Info "Checking Artifact Registry repo '$ArtifactRepo'..."
    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    gcloud artifacts repositories describe $ArtifactRepo --location $Region --project $ProjectId 2>$null 1>$null
    $repoExists = $LASTEXITCODE -eq 0
    $ErrorActionPreference = $previousPreference

    if (-not $repoExists) {
        Write-Info "Creating repository '$ArtifactRepo'..."
        gcloud artifacts repositories create $ArtifactRepo --repository-format=docker --location $Region --project $ProjectId --description 'T3CK Core Cloud Run images' | Out-Null
    }

    Write-Ok 'Artifact Registry ready'
}

function New-ServiceImage([string]$ServiceName, [string]$DockerfilePath) {
    $tag = (Get-Date -Format 'yyyyMMddHHmmss')
    $image = '{0}-docker.pkg.dev/{1}/{2}/{3}:{4}' -f $Region, $ProjectId, $ArtifactRepo, $ServiceName, $tag
        $cloudBuildConfigPath = Join-Path $env:TEMP ("cloudbuild-{0}.json" -f $ServiceName)
        $cloudBuildConfig = @{
            steps = @(
                @{
                    name = 'gcr.io/cloud-builders/docker'
                    args = @('build', '-f', $DockerfilePath, '-t', $image, '.')
                }
            )
            images = @($image)
        } | ConvertTo-Json -Depth 10

        Set-Content -Path $cloudBuildConfigPath -Value $cloudBuildConfig -Encoding UTF8

    Write-Info "Building image for $ServiceName..."
        gcloud builds submit . --project $ProjectId --region $Region --config $cloudBuildConfigPath | Out-Null
        Remove-Item -Path $cloudBuildConfigPath -Force -ErrorAction SilentlyContinue
    if ($LASTEXITCODE -ne 0) {
        throw "Build failed for $ServiceName"
    }

    Write-Ok "Image built: $image"
    return $image.Trim()
}

function Publish-Service([string]$ServiceName, [string]$Image, [hashtable]$EnvVars) {
    $cloudRunServiceName = "$ServicePrefix-$ServiceName"
    $envArg = ($EnvVars.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join ','

    Write-Info "Deploying $cloudRunServiceName..."
    gcloud run deploy $cloudRunServiceName `
        --project $ProjectId `
        --region $Region `
        --platform managed `
        --image $Image `
        --allow-unauthenticated `
        --port 8080 `
        --set-env-vars $envArg `
        --quiet

    if ($LASTEXITCODE -ne 0) {
        throw "Deploy failed for $cloudRunServiceName"
    }

    $url = (gcloud run services describe $cloudRunServiceName --project $ProjectId --region $Region --format='value(status.url)').Trim()
    Write-Ok "$cloudRunServiceName deployed at $url"
    return $url
}

function New-ExampleTenant([string]$GatewayUrl, [string]$ExampleTenantId) {
    Write-Info "Creating example tenant '$ExampleTenantId' via gateway..."

    $payload = @{
        tenantId = $ExampleTenantId
        domain = "$ExampleTenantId.demo.t3ck.local"
        companyName = 'Loja Exemplo Cloud Run'
        contactName = 'Owner Example'
        plan = 'starter'
        contactEmail = 'owner@example.com'
        adminEmail = 'owner@example.com'
        numberOfSeats = 25
        billingAddress = 'Rua Exemplo, 123'
        billingCountry = 'BR'
        billingZipCode = '01000-000'
        monthlyBudget = 3000
    } | ConvertTo-Json

    $provisionResponse = Invoke-RestMethod -Method Post -Uri "$GatewayUrl/api/v1/provisioning/submit" -ContentType 'application/json' -Body $payload

    Start-Sleep -Seconds 3
    $statusResponse = Invoke-RestMethod -Method Get -Uri "$GatewayUrl/api/v1/provisioning/$ExampleTenantId/status"

    $demoProductPayload = @{
        tenantId = $ExampleTenantId
        name = 'Produto Exemplo Cloud Run'
        sku = 'CLOUDRUN-DEMO-001'
        price = 199.9
        stock = 50
        status = 'active'
    } | ConvertTo-Json

    $adminHeaders = @{ 'X-Tenant-ID' = $ExampleTenantId }
    $productResponse = Invoke-RestMethod -Method Post -Uri "$GatewayUrl/api/v1/admin/products" -Headers $adminHeaders -ContentType 'application/json' -Body $demoProductPayload

    Write-Ok "Tenant criado: $ExampleTenantId"
    Write-Info "Provisioning response: $($provisionResponse.message)"
    Write-Info "Tenant status: $($statusResponse.data.status)"
    Write-Info "Produto demo criado: $($productResponse.data.name)"
}

Initialize-GcloudContext
Initialize-ServicesEnabled
Initialize-ArtifactRepository

if (-not $TenantId) {
    $TenantId = "loja-exemplo-$(Get-Random -Minimum 1000 -Maximum 9999)"
}

$tenantImage = New-ServiceImage -ServiceName 'tenant-service' -DockerfilePath 'services/tenant-service/Dockerfile'
$adminImage = New-ServiceImage -ServiceName 'admin-service' -DockerfilePath 'services/admin-service/Dockerfile'
$gatewayImage = New-ServiceImage -ServiceName 'api-gateway' -DockerfilePath 'services/api-gateway/Dockerfile'

$tenantUrl = Publish-Service -ServiceName 'tenant-service' -Image $tenantImage -EnvVars @{
    NODE_ENV = 'production'
    PORT = '8080'
    GCP_PROJECT_ID = $ProjectId
    GCP_REGION = $Region
    RATE_LIMIT_STORE = 'redis'
    SENTRY_DSN = ''
}

$adminUrl = Publish-Service -ServiceName 'admin-service' -Image $adminImage -EnvVars @{
    NODE_ENV = 'production'
    PORT = '8080'
    GCP_PROJECT_ID = $ProjectId
    GCP_REGION = $Region
    RATE_LIMIT_STORE = 'redis'
}

$gatewayUrl = Publish-Service -ServiceName 'api-gateway' -Image $gatewayImage -EnvVars @{
    NODE_ENV = 'production'
    PORT = '8080'
    GCP_PROJECT_ID = $ProjectId
    GCP_REGION = $Region
    ENABLE_CSRF = 'false'
    RATE_LIMIT_STORE = 'redis'
    CORS_ORIGINS = '*'
    TENANT_SERVICE_URL = $tenantUrl
    ADMIN_SERVICE_URL = $adminUrl
    UNIFIED_SWAGGER_BASE_URL = $tenantUrl
}

Write-Host ''
Write-Ok 'Cloud Run deployment finished.'
Write-Host "Gateway URL        : $gatewayUrl"
Write-Host "Tenant Service URL : $tenantUrl"
Write-Host "Admin Service URL  : $adminUrl"
Write-Host "Unified Swagger    : $gatewayUrl/api-docs-all"
Write-Host "Create Tenant API  : $gatewayUrl/api/v1/provisioning/submit"
Write-Host "Admin Products API : $gatewayUrl/api/v1/admin/products"
Write-Host ''
Write-Host 'To run the unified panel locally pointing to Cloud Run:' -ForegroundColor Cyan
Write-Host '$env:VITE_GATEWAY_BASE_URL="<gateway-url>"' -ForegroundColor White
Write-Host 'pnpm --filter @t3ck/admin-unified-dashboard dev' -ForegroundColor White

if ($CreateExampleTenant) {
    New-ExampleTenant -GatewayUrl $gatewayUrl -ExampleTenantId $TenantId
}
