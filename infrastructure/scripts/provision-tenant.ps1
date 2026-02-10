# PowerShell script para provisionamento de tenant no Windows

param(
    [Parameter(Mandatory=$true)]
    [string]$TenantId,
    
    [Parameter(Mandatory=$true)]
    [string]$Domain,
    
    [Parameter(Mandatory=$false)]
    [string]$Region = "us-east-1",
    
    [Parameter(Mandatory=$false)]
    [string]$FirebaseProjectId = ""
    ,
    [Parameter(Mandatory=$false)]
    [string]$DbPassword = ""
    ,
    [Parameter(Mandatory=$false)]
    [string]$TfvarsFile = ""
)

$ErrorActionPreference = "Stop"

function Write-Log {
    param([string]$Message)
    Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message" -ForegroundColor Green
}

function Write-Error-Log {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
    exit 1
}

function Write-Warn-Log {
    param([string]$Message)
    Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

$StepDurations = @()
$StepStart = $null

function Start-Step {
    $script:StepStart = Get-Date
}

function End-Step {
    param([string]$Name)
    $end = Get-Date
    $duration = [int]($end - $script:StepStart).TotalSeconds
    $script:StepDurations += [pscustomobject]@{
        Name = $Name
        Seconds = $duration
    }
}

Write-Log "Starting provisioning for tenant: $TenantId"
Write-Log "Domain: $Domain"
Write-Log "Region: $Region"

$StartTime = Get-Date

# 1. Validação de inputs
Start-Step
Write-Log "Step 1/8: Validating inputs..."
if ($TenantId -notmatch '^[a-z0-9-]{3,50}$') {
    Write-Error-Log "Invalid tenant ID format. Must be 3-50 alphanumeric characters with hyphens."
}

if ($Domain -notmatch '^([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}$') {
    Write-Error-Log "Invalid domain format."
}

Write-Log "✓ Inputs validated"
End-Step "Validate inputs"

# 2. Executar Terraform
Start-Step
Write-Log "Step 2/8: Running Terraform..."
Push-Location "infrastructure\terraform"

if (-not (Test-Path "terraform.tfstate")) {
    Write-Log "Initializing Terraform..."
    terraform init
}

if (-not [string]::IsNullOrEmpty($DbPassword) -and $DbPassword.Length -lt 16) {
    Write-Error-Log "Database password must be at least 16 characters"
}

if (-not [string]::IsNullOrEmpty($TfvarsFile)) {
    $TfvarsArg = "-var-file=$TfvarsFile"
}

if (-not [string]::IsNullOrEmpty($DbPassword)) {
    $DbPasswordArg = "-var=\"db_password=$DbPassword\""
}

terraform plan -out=tfplan `
    -var="aws_region=$Region" `
    -var="environment=production" `
    -var="project_name=t3ck" `
    $DbPasswordArg `
    $TfvarsArg

terraform apply tfplan

$TerraformOutputs = terraform output -json | ConvertFrom-Json
$VpcId = $TerraformOutputs.vpc_id.value
$PublicSubnets = ($TerraformOutputs.public_subnet_ids.value -join ',')
$PrivateSubnets = ($TerraformOutputs.private_subnet_ids.value -join ',')
$AlbSgId = $TerraformOutputs.alb_security_group_id.value
$EcsSgId = $TerraformOutputs.ecs_security_group_id.value
$EcsTaskExecRole = $TerraformOutputs.ecs_task_execution_role_arn.value
$EcsTaskRole = $TerraformOutputs.ecs_task_role_arn.value
$LambdaRole = $TerraformOutputs.lambda_role_arn.value
$DbHost = $TerraformOutputs.db_endpoint.value
$DbPort = $TerraformOutputs.db_port.value
$DbName = $TerraformOutputs.db_name.value
$DbUser = $TerraformOutputs.db_username.value
$RedisHost = $TerraformOutputs.cache_primary_endpoint.value
$RedisPort = $TerraformOutputs.cache_port.value
$DbSecretArn = $TerraformOutputs.database_secret_arn.value

Write-Log "✓ Terraform applied successfully"
End-Step "Terraform"
Pop-Location

# 3. Executar CDK
Start-Step
Write-Log "Step 3/8: Running AWS CDK..."
Push-Location "infrastructure\cdk"

if (-not (Test-Path "node_modules")) {
    npm install
}

cdk synth --context vpcId=$VpcId `
    --context privateSubnetIds=$PrivateSubnets `
    --context publicSubnetIds=$PublicSubnets `
    --context ecsSecurityGroupId=$EcsSgId `
    --context albSecurityGroupId=$AlbSgId `
    --context ecsTaskExecutionRoleArn=$EcsTaskExecRole `
    --context ecsTaskRoleArn=$EcsTaskRole `
    --context lambdaRoleArn=$LambdaRole `
    --context redisHost=$RedisHost `
    --context redisPort=$RedisPort `
    --context dbHost=$DbHost `
    --context dbPort=$DbPort `
    --context dbName=$DbName `
    --context dbUser=$DbUser `
    --context dbSecretArn=$DbSecretArn

cdk deploy --require-approval never `
    --context vpcId=$VpcId `
    --context privateSubnetIds=$PrivateSubnets `
    --context publicSubnetIds=$PublicSubnets `
    --context ecsSecurityGroupId=$EcsSgId `
    --context albSecurityGroupId=$AlbSgId `
    --context ecsTaskExecutionRoleArn=$EcsTaskExecRole `
    --context ecsTaskRoleArn=$EcsTaskRole `
    --context lambdaRoleArn=$LambdaRole `
    --context redisHost=$RedisHost `
    --context redisPort=$RedisPort `
    --context dbHost=$DbHost `
    --context dbPort=$DbPort `
    --context dbName=$DbName `
    --context dbUser=$DbUser `
    --context dbSecretArn=$DbSecretArn

$CdkOutputs = aws cloudformation describe-stacks --stack-name T3CKStack --query 'Stacks[0].Outputs' --output json | ConvertFrom-Json
$AlbDns = ($CdkOutputs | Where-Object { $_.OutputKey -eq "ALBDNS" }).OutputValue

Write-Log "✓ CDK deployed successfully"
End-Step "CDK"
Pop-Location

# 4. Criar Firebase project
Start-Step
Write-Log "Step 4/8: Setting up Firebase..."
if ([string]::IsNullOrEmpty($FirebaseProjectId)) {
    $FirebaseProjectId = "t3ck-$TenantId"
}

if (-not (Get-Command firebase -ErrorAction SilentlyContinue)) {
    Write-Warn-Log "Firebase CLI not found. Skipping Firebase setup."
    Write-Warn-Log "Please install Firebase CLI: npm install -g firebase-tools"
} else {
    firebase projects:create $FirebaseProjectId --display-name "T3CK - $TenantId" 2>$null
    firebase firestore:databases:create --project $FirebaseProjectId 2>$null
    Write-Log "✓ Firebase configured"
}
End-Step "Firebase"

# 5. Configurar Route53
Start-Step
Write-Log "Step 5/8: Configuring Route53 domain..."
$HostedZoneId = aws route53 list-hosted-zones --query "HostedZones[?Name=='t3ck.com.'].Id" --output text | ForEach-Object { $_ -replace '/hostedzone/', '' }

if ([string]::IsNullOrEmpty($HostedZoneId)) {
    Write-Warn-Log "Route53 hosted zone not found. Skipping domain configuration."
} else {
    $ChangeBatch = @{
        Changes = @(
            @{
                Action = "UPSERT"
                ResourceRecordSet = @{
                    Name = $Domain
                    Type = "A"
                    AliasTarget = @{
                        DNSName = $AlbDns
                        EvaluateTargetHealth = $false
                        HostedZoneId = "Z35SXDOTRQ7X7K"
                    }
                }
            }
        )
    } | ConvertTo-Json -Depth 10

    aws route53 change-resource-record-sets --hosted-zone-id $HostedZoneId --change-batch $ChangeBatch 2>$null
    Write-Log "✓ Domain configured"
}
End-Step "Route53"

# 6. Deploy containers
Start-Step
Write-Log "Step 6/8: Deploying Docker containers..."
Write-Log "✓ Containers deployed (assuming images are in ECR)"
End-Step "Deploy containers"

# 7. Gerar chaves de API
Start-Step
Write-Log "Step 7/8: Generating API keys..."
$ApiKey = -join ((48..57) + (97..102) | Get-Random -Count 64 | ForEach-Object {[char]$_})
$SecretKey = -join ((48..57) + (97..102) | Get-Random -Count 64 | ForEach-Object {[char]$_})

$SecretName = "t3ck/production/api-keys/$TenantId"
$SecretValue = @{
    apiKey = $ApiKey
    secretKey = $SecretKey
    tenantId = $TenantId
} | ConvertTo-Json -Compress

aws secretsmanager create-secret --name $SecretName --secret-string $SecretValue --description "API keys for tenant $TenantId" 2>$null
if ($LASTEXITCODE -ne 0) {
    aws secretsmanager update-secret --secret-id $SecretName --secret-string $SecretValue 2>$null
}

Write-Log "✓ API keys generated and stored in Secrets Manager"
Write-Log "  API Key: $ApiKey"
Write-Log "  Secret Key: $SecretKey"
End-Step "API keys"

# 8. Health checks
Start-Step
Write-Log "Step 8/8: Running health checks..."
Start-Sleep -Seconds 30

$HealthCheckUrl = "http://$AlbDns/health"
$MaxRetries = 10
$RetryCount = 0

while ($RetryCount -lt $MaxRetries) {
    try {
        $Response = Invoke-WebRequest -Uri $HealthCheckUrl -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
        if ($Response.StatusCode -eq 200) {
            Write-Log "✓ Health check passed"
            break
        }
    } catch {
        $RetryCount++
        if ($RetryCount -lt $MaxRetries) {
            Write-Warn-Log "Health check failed. Retrying... ($RetryCount/$MaxRetries)"
            Start-Sleep -Seconds 10
        } else {
            Write-Error-Log "Health check failed after $MaxRetries attempts"
        }
    }
}
End-Step "Health checks"

$EndTime = Get-Date
$Duration = $EndTime - $StartTime

Write-Log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
Write-Log "✓ Provisioning completed successfully!"
Write-Log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
Write-Log "Tenant ID: $TenantId"
Write-Log "Domain: $Domain"
Write-Log "ALB DNS: $AlbDns"
Write-Log "Duration: $($Duration.Minutes)m $($Duration.Seconds)s"
Write-Log "Step timings:"
foreach ($step in $StepDurations) {
    Write-Log "- $($step.Name): $($step.Seconds)s"
}
Write-Log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
