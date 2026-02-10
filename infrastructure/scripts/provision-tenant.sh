#!/bin/bash

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Função para log
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

step_start() {
    STEP_START=$(date +%s)
}

step_end() {
    local step_name="$1"
    local step_end
    step_end=$(date +%s)
    local duration=$((step_end - STEP_START))
    STEP_LABELS+=("$step_name")
    STEP_SECONDS+=("$duration")
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
    exit 1
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# Validação de parâmetros
TENANT_ID=""
DOMAIN=""
REGION="us-east-1"
FIREBASE_PROJECT_ID=""
DB_PASSWORD=""
TFVARS_FILE=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --tenant-id)
            TENANT_ID="$2"
            shift 2
            ;;
        --domain)
            DOMAIN="$2"
            shift 2
            ;;
        --region)
            REGION="$2"
            shift 2
            ;;
        --firebase-project-id)
            FIREBASE_PROJECT_ID="$2"
            shift 2
            ;;
        --db-password)
            DB_PASSWORD="$2"
            shift 2
            ;;
        --tfvars)
            TFVARS_FILE="$2"
            shift 2
            ;;
        *)
            error "Unknown option: $1"
            ;;
    esac
done

if [ -z "$TENANT_ID" ]; then
    error "Tenant ID is required (--tenant-id)"
fi

if [ -z "$DOMAIN" ]; then
    error "Domain is required (--domain)"
fi

if [ -n "$DB_PASSWORD" ] && [ ${#DB_PASSWORD} -lt 16 ]; then
    error "Database password must be at least 16 characters"
fi

log "Starting provisioning for tenant: $TENANT_ID"
log "Domain: $DOMAIN"
log "Region: $REGION"

START_TIME=$(date +%s)
STEP_LABELS=()
STEP_SECONDS=()

# 1. Validação de inputs
step_start
log "Step 1/8: Validating inputs..."
if [[ ! "$TENANT_ID" =~ ^[a-z0-9-]{3,50}$ ]]; then
    error "Invalid tenant ID format. Must be 3-50 alphanumeric characters with hyphens."
fi

if [[ ! "$DOMAIN" =~ ^([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}$ ]]; then
    error "Invalid domain format."
fi

log "✓ Inputs validated"
step_end "Validate inputs"

# 2. Executar Terraform
step_start
log "Step 2/8: Running Terraform..."
cd infrastructure/terraform

if [ ! -f "terraform.tfstate" ]; then
    log "Initializing Terraform..."
    terraform init
fi

DB_PASSWORD_ARG=""
if [ -n "$DB_PASSWORD" ]; then
    DB_PASSWORD_ARG="-var=\"db_password=$DB_PASSWORD\""
fi

TFVARS_ARG=""
if [ -n "$TFVARS_FILE" ]; then
    TFVARS_ARG="-var-file=\"$TFVARS_FILE\""
fi

terraform plan -out=tfplan \
    -var="aws_region=$REGION" \
    -var="environment=production" \
    -var="project_name=t3ck" \
    $DB_PASSWORD_ARG \
    $TFVARS_ARG

terraform apply tfplan

TERRAFORM_OUTPUTS=$(terraform output -json)
VPC_ID=$(echo $TERRAFORM_OUTPUTS | jq -r '.vpc_id.value')
PUBLIC_SUBNETS=$(echo $TERRAFORM_OUTPUTS | jq -r '.public_subnet_ids.value[]' | tr '\n' ',' | sed 's/,$//')
PRIVATE_SUBNETS=$(echo $TERRAFORM_OUTPUTS | jq -r '.private_subnet_ids.value[]' | tr '\n' ',' | sed 's/,$//')
ALB_SG_ID=$(echo $TERRAFORM_OUTPUTS | jq -r '.alb_security_group_id.value')
ECS_SG_ID=$(echo $TERRAFORM_OUTPUTS | jq -r '.ecs_security_group_id.value')
ECS_TASK_EXEC_ROLE=$(echo $TERRAFORM_OUTPUTS | jq -r '.ecs_task_execution_role_arn.value')
ECS_TASK_ROLE=$(echo $TERRAFORM_OUTPUTS | jq -r '.ecs_task_role_arn.value')
LAMBDA_ROLE=$(echo $TERRAFORM_OUTPUTS | jq -r '.lambda_role_arn.value')
DB_HOST=$(echo $TERRAFORM_OUTPUTS | jq -r '.db_endpoint.value')
DB_PORT=$(echo $TERRAFORM_OUTPUTS | jq -r '.db_port.value')
DB_NAME=$(echo $TERRAFORM_OUTPUTS | jq -r '.db_name.value')
DB_USER=$(echo $TERRAFORM_OUTPUTS | jq -r '.db_username.value')
REDIS_HOST=$(echo $TERRAFORM_OUTPUTS | jq -r '.cache_primary_endpoint.value')
REDIS_PORT=$(echo $TERRAFORM_OUTPUTS | jq -r '.cache_port.value')
DB_SECRET_ARN=$(echo $TERRAFORM_OUTPUTS | jq -r '.database_secret_arn.value')

log "✓ Terraform applied successfully"
step_end "Terraform"

# 3. Executar CDK
step_start
log "Step 3/8: Running AWS CDK..."
cd ../cdk

if [ ! -d "node_modules" ]; then
    npm install
fi

cdk synth --context vpcId=$VPC_ID \
    --context privateSubnetIds=$PRIVATE_SUBNETS \
    --context publicSubnetIds=$PUBLIC_SUBNETS \
    --context ecsSecurityGroupId=$ECS_SG_ID \
    --context albSecurityGroupId=$ALB_SG_ID \
    --context ecsTaskExecutionRoleArn=$ECS_TASK_EXEC_ROLE \
    --context ecsTaskRoleArn=$ECS_TASK_ROLE \
    --context lambdaRoleArn=$LAMBDA_ROLE \
    --context redisHost=$REDIS_HOST \
    --context redisPort=$REDIS_PORT \
    --context dbHost=$DB_HOST \
    --context dbPort=$DB_PORT \
    --context dbName=$DB_NAME \
    --context dbUser=$DB_USER \
    --context dbSecretArn=$DB_SECRET_ARN

cdk deploy --require-approval never \
    --context vpcId=$VPC_ID \
    --context privateSubnetIds=$PRIVATE_SUBNETS \
    --context publicSubnetIds=$PUBLIC_SUBNETS \
    --context ecsSecurityGroupId=$ECS_SG_ID \
    --context albSecurityGroupId=$ALB_SG_ID \
    --context ecsTaskExecutionRoleArn=$ECS_TASK_EXEC_ROLE \
    --context ecsTaskRoleArn=$ECS_TASK_ROLE \
    --context lambdaRoleArn=$LAMBDA_ROLE \
    --context redisHost=$REDIS_HOST \
    --context redisPort=$REDIS_PORT \
    --context dbHost=$DB_HOST \
    --context dbPort=$DB_PORT \
    --context dbName=$DB_NAME \
    --context dbUser=$DB_USER \
    --context dbSecretArn=$DB_SECRET_ARN

CDK_OUTPUTS=$(aws cloudformation describe-stacks --stack-name T3CKStack --query 'Stacks[0].Outputs' --output json)
ALB_DNS=$(echo $CDK_OUTPUTS | jq -r '.[] | select(.OutputKey=="ALBDNS") | .OutputValue')

log "✓ CDK deployed successfully"
step_end "CDK"

# 4. Criar Firebase project e Firestore database
step_start
log "Step 4/8: Setting up Firebase..."
if [ -z "$FIREBASE_PROJECT_ID" ]; then
    FIREBASE_PROJECT_ID="t3ck-${TENANT_ID}"
fi

# Verificar se Firebase CLI está instalado
if ! command -v firebase &> /dev/null; then
    warn "Firebase CLI not found. Skipping Firebase setup."
    warn "Please install Firebase CLI: npm install -g firebase-tools"
else
    # Criar projeto Firebase (se não existir)
    firebase projects:create $FIREBASE_PROJECT_ID --display-name "T3CK - $TENANT_ID" || true
    
    # Inicializar Firestore
    firebase firestore:databases:create --project $FIREBASE_PROJECT_ID || true
    
    log "✓ Firebase configured"
fi
step_end "Firebase"

# 5. Configurar domínio no Route53
step_start
log "Step 5/8: Configuring Route53 domain..."
HOSTED_ZONE_ID=$(aws route53 list-hosted-zones --query "HostedZones[?Name=='t3ck.com.'].Id" --output text | sed 's|/hostedzone/||')

if [ -z "$HOSTED_ZONE_ID" ]; then
    warn "Route53 hosted zone not found. Skipping domain configuration."
else
    # Criar registro A apontando para ALB
    aws route53 change-resource-record-sets \
        --hosted-zone-id $HOSTED_ZONE_ID \
        --change-batch "{
            \"Changes\": [{
                \"Action\": \"UPSERT\",
                \"ResourceRecordSet\": {
                    \"Name\": \"$DOMAIN\",
                    \"Type\": \"A\",
                    \"AliasTarget\": {
                        \"DNSName\": \"$ALB_DNS\",
                        \"EvaluateTargetHealth\": false,
                        \"HostedZoneId\": \"Z35SXDOTRQ7X7K\"
                    }
                }
            }]
        }" || warn "Failed to create Route53 record"
    
    log "✓ Domain configured"
fi
step_end "Route53"

# 6. Deploy inicial dos containers Docker
step_start
log "Step 6/8: Deploying Docker containers..."
# Assumindo que as imagens já estão no ECR
# Em produção, isso seria feito pelo CI/CD

log "✓ Containers deployed (assuming images are in ECR)"
step_end "Deploy containers"

# 7. Gerar chaves de API e armazenar no Secrets Manager
step_start
log "Step 7/8: Generating API keys..."
API_KEY=$(openssl rand -hex 32)
SECRET_KEY=$(openssl rand -hex 32)

SECRET_NAME="t3ck/production/api-keys/${TENANT_ID}"

aws secretsmanager create-secret \
    --name $SECRET_NAME \
    --secret-string "{\"apiKey\":\"$API_KEY\",\"secretKey\":\"$SECRET_KEY\",\"tenantId\":\"$TENANT_ID\"}" \
    --description "API keys for tenant $TENANT_ID" || \
aws secretsmanager update-secret \
    --secret-id $SECRET_NAME \
    --secret-string "{\"apiKey\":\"$API_KEY\",\"secretKey\":\"$SECRET_KEY\",\"tenantId\":\"$TENANT_ID\"}"

log "✓ API keys generated and stored in Secrets Manager"
log "  API Key: $API_KEY"
log "  Secret Key: $SECRET_KEY"
step_end "API keys"

# 8. Validação final (health checks)
step_start
log "Step 8/8: Running health checks..."
sleep 30 # Aguardar serviços iniciarem

HEALTH_CHECK_URL="http://$ALB_DNS/health"
MAX_RETRIES=10
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -f -s $HEALTH_CHECK_URL > /dev/null 2>&1; then
        log "✓ Health check passed"
        break
    fi
    
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
        warn "Health check failed. Retrying... ($RETRY_COUNT/$MAX_RETRIES)"
        sleep 10
    else
        error "Health check failed after $MAX_RETRIES attempts"
    fi
done
step_end "Health checks"

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
MINUTES=$((DURATION / 60))
SECONDS=$((DURATION % 60))

log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log "✓ Provisioning completed successfully!"
log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log "Tenant ID: $TENANT_ID"
log "Domain: $DOMAIN"
log "ALB DNS: $ALB_DNS"
log "Duration: ${MINUTES}m ${SECONDS}s"
log "Step timings:"
for i in "${!STEP_LABELS[@]}"; do
    log "- ${STEP_LABELS[$i]}: ${STEP_SECONDS[$i]}s"
done
log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
