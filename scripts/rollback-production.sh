#!/bin/bash

# T3CK Production Rollback Script
# Usage: ./rollback-production.sh [service-name] [commit-sha]
# Example: ./rollback-production.sh auth-service abc123def456

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
CLUSTER_NAME="t3ck-cluster"
AWS_REGION="${AWS_REGION:-us-east-1}"
SERVICES=("auth-service" "webhook-service" "tenant-service")

# Functions
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}✓ $1${NC}"
}

error() {
    echo -e "${RED}✗ $1${NC}"
    exit 1
}

warn() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

# Validate arguments
if [ $# -lt 1 ]; then
    echo "Usage: $0 <service-name> [commit-sha]"
    echo ""
    echo "Examples:"
    echo "  $0 auth-service                    # Rollback all services to previous version"
    echo "  $0 auth-service abc123             # Rollback auth-service to specific commit"
    echo "  $0 all                             # Rollback all services"
    exit 1
fi

SERVICE=$1
COMMIT_SHA=${2:-""}

# Validate AWS credentials
log "Validating AWS credentials..."
if ! aws sts get-caller-identity &>/dev/null; then
    error "AWS credentials not configured. Please configure AWS CLI."
fi
success "AWS credentials validated"

# Validate cluster exists
log "Validating ECS cluster..."
if ! aws ecs describe-clusters --cluster $CLUSTER_NAME --region $AWS_REGION &>/dev/null; then
    error "ECS cluster '$CLUSTER_NAME' not found in region '$AWS_REGION'"
fi
success "ECS cluster found"

# Function to rollback a service
rollback_service() {
    local svc=$1
    local commit=$2
    
    log "Rolling back service: $svc"
    
    # Describe current task definition
    CURRENT_TASK_DEF=$(aws ecs describe-services \
        --cluster $CLUSTER_NAME \
        --services $svc \
        --region $AWS_REGION \
        --query 'services[0].taskDefinition' \
        --output text)
    
    if [ -z "$CURRENT_TASK_DEF" ]; then
        error "Could not find task definition for service: $svc"
    fi
    
    log "Current task definition: $CURRENT_TASK_DEF"
    
    if [ -n "$commit" ]; then
        # Rollback to specific commit
        NEW_TASK_DEF="${svc}:prod-${commit}"
        log "Rolling back to commit: $commit"
    else
        # Rollback to previous version (decrement revision)
        CURRENT_REVISION=$(echo "$CURRENT_TASK_DEF" | awk -F':' '{print $NF}')
        PREVIOUS_REVISION=$((CURRENT_REVISION - 1))
        
        if [ $PREVIOUS_REVISION -lt 1 ]; then
            error "Cannot rollback further - at revision 1"
        fi
        
        NEW_TASK_DEF="${svc}:${PREVIOUS_REVISION}"
        log "Rolling back to revision: $PREVIOUS_REVISION"
    fi
    
    # Verify task definition exists
    if ! aws ecs describe-task-definition \
        --task-definition "$NEW_TASK_DEF" \
        --region $AWS_REGION &>/dev/null; then
        error "Task definition not found: $NEW_TASK_DEF"
    fi
    
    # Update service
    log "Updating service with task definition: $NEW_TASK_DEF"
    
    aws ecs update-service \
        --cluster $CLUSTER_NAME \
        --service $svc \
        --task-definition "$NEW_TASK_DEF" \
        --region $AWS_REGION > /dev/null
    
    success "Service $svc updated"
    
    # Wait for service to stabilize
    log "Waiting for service to stabilize (up to 10 minutes)..."
    
    if aws ecs wait services-stable \
        --cluster $CLUSTER_NAME \
        --services $svc \
        --region $AWS_REGION; then
        success "Service $svc is stable"
    else
        warn "Service $svc did not stabilize within timeout. Check ECS console for details."
    fi
}

# Perform rollback
if [ "$SERVICE" == "all" ]; then
    log "Rolling back all services..."
    for svc in "${SERVICES[@]}"; do
        rollback_service "$svc" "$COMMIT_SHA"
    done
    success "All services rolled back successfully"
else
    # Validate service exists
    SERVICE_EXISTS=false
    for svc in "${SERVICES[@]}"; do
        if [ "$SERVICE" == "$svc" ]; then
            SERVICE_EXISTS=true
            break
        fi
    done
    
    if [ "$SERVICE_EXISTS" == false ]; then
        error "Service '$SERVICE' not recognized. Valid services: ${SERVICES[@]}"
    fi
    
    rollback_service "$SERVICE" "$COMMIT_SHA"
fi

# Verify health
log "Verifying service health..."

for svc in "${SERVICES[@]}"; do
    RUNNING=$(aws ecs describe-services \
        --cluster $CLUSTER_NAME \
        --services $svc \
        --region $AWS_REGION \
        --query 'services[0].runningCount' \
        --output text)
    
    if [ "$RUNNING" -gt 0 ]; then
        success "Service $svc is running ($RUNNING tasks)"
    else
        warn "Service $svc has no running tasks"
    fi
done

# Send notification
log "Sending Slack notification..."

SLACK_WEBHOOK="${SLACK_WEBHOOK_URL:-}"
if [ -n "$SLACK_WEBHOOK" ]; then
    curl -X POST "$SLACK_WEBHOOK" \
        -H 'Content-Type: application/json' \
        -d "{
            \"text\": \"🔄 T3CK Production Rollback\",
            \"attachments\": [{
                \"color\": \"warning\",
                \"fields\": [
                    {\"title\": \"Service(s)\", \"value\": \"$SERVICE\", \"short\": true},
                    {\"title\": \"Timestamp\", \"value\": \"$(date -u +'%Y-%m-%d %H:%M:%S UTC')\", \"short\": true},
                    {\"title\": \"Status\", \"value\": \"✓ Rollback Complete\", \"short\": false}
                ]
            }]
        }" 2>/dev/null || warn "Failed to send Slack notification"
else
    warn "SLACK_WEBHOOK_URL not set - skipping Slack notification"
fi

success "Rollback complete!"
log "Summary:"
log "  - Service(s): $SERVICE"
if [ -n "$COMMIT_SHA" ]; then
    log "  - Rolled back to commit: $COMMIT_SHA"
else
    log "  - Rolled back to previous version"
fi
log "  - Time: $(date -u +'%Y-%m-%d %H:%M:%S UTC')"
log ""
log "Next steps:"
log "  1. Verify application functionality"
log "  2. Check logs: aws logs tail /aws/ecs/t3ck-cluster --follow"
log "  3. Investigate root cause"
log "  4. Fix and re-deploy when ready"
