# T3CK Production Rollback Script
# Usage: .\rollback-production.ps1 -Service auth-service -CommitSha abc123
# Example: .\rollback-production.ps1 -Service auth-service

param(
    [Parameter(Mandatory=$true)]
    [string]$Service,
    
    [Parameter(Mandatory=$false)]
    [string]$CommitSha,
    
    [Parameter(Mandatory=$false)]
    [string]$AwsRegion = "us-east-1"
)

# Configuration
$CLUSTER_NAME = "t3ck-cluster"
$SERVICES = @("auth-service", "webhook-service", "tenant-service")

# Colors/Formatting
function Write-Log {
    param([string]$Message)
    Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host "✓ $Message" -ForegroundColor Green
}

function Write-Error-Custom {
    param([string]$Message)
    Write-Host "✗ $Message" -ForegroundColor Red
    exit 1
}

function Write-Warn {
    param([string]$Message)
    Write-Host "⚠ $Message" -ForegroundColor Yellow
}

# Validate AWS credentials
Write-Log "Validating AWS credentials..."
try {
    $null = aws sts get-caller-identity --region $AwsRegion
    Write-Success "AWS credentials validated"
} catch {
    Write-Error-Custom "AWS credentials not configured. Please configure AWS CLI."
}

# Validate cluster exists
Write-Log "Validating ECS cluster..."
try {
    $null = aws ecs describe-clusters --cluster $CLUSTER_NAME --region $AwsRegion 2>$null
    Write-Success "ECS cluster found"
} catch {
    Write-Error-Custom "ECS cluster '$CLUSTER_NAME' not found in region '$AwsRegion'"
}

# Function to rollback a service
function Rollback-Service {
    param(
        [string]$ServiceName,
        [string]$Commit
    )
    
    Write-Log "Rolling back service: $ServiceName"
    
    # Get current task definition
    try {
        $currentTaskDef = aws ecs describe-services `
            --cluster $CLUSTER_NAME `
            --services $ServiceName `
            --region $AwsRegion `
            --query 'services[0].taskDefinition' `
            --output text
    } catch {
        Write-Error-Custom "Could not find task definition for service: $ServiceName"
    }
    
    if ([string]::IsNullOrEmpty($currentTaskDef)) {
        Write-Error-Custom "Service not found: $ServiceName"
    }
    
    Write-Log "Current task definition: $currentTaskDef"
    
    # Determine new task definition
    $newTaskDef = ""
    if ($Commit) {
        $newTaskDef = "${ServiceName}:prod-${Commit}"
        Write-Log "Rolling back to commit: $Commit"
    } else {
        # Get current revision and decrement
        $currentRevision = [int]($currentTaskDef -split ':' | Select-Object -Last 1)
        $previousRevision = $currentRevision - 1
        
        if ($previousRevision -lt 1) {
            Write-Error-Custom "Cannot rollback further - at revision 1"
        }
        
        $newTaskDef = "${ServiceName}:${previousRevision}"
        Write-Log "Rolling back to revision: $previousRevision"
    }
    
    # Verify task definition exists
    try {
        $null = aws ecs describe-task-definition `
            --task-definition $newTaskDef `
            --region $AwsRegion 2>$null
    } catch {
        Write-Error-Custom "Task definition not found: $newTaskDef"
    }
    
    # Update service
    Write-Log "Updating service with task definition: $newTaskDef"
    
    try {
        $null = aws ecs update-service `
            --cluster $CLUSTER_NAME `
            --service $ServiceName `
            --task-definition $newTaskDef `
            --region $AwsRegion
    } catch {
        Write-Error-Custom "Failed to update service: $_"
    }
    
    Write-Success "Service $ServiceName updated"
    
    # Wait for service to stabilize
    Write-Log "Waiting for service to stabilize (up to 10 minutes)..."
    
    try {
        $null = aws ecs wait services-stable `
            --cluster $CLUSTER_NAME `
            --services $ServiceName `
            --region $AwsRegion
        
        Write-Success "Service $ServiceName is stable"
    } catch {
        Write-Warn "Service $ServiceName did not stabilize within timeout. Check ECS console for details."
    }
}

# Validate service
if ($Service -eq "all") {
    Write-Log "Rolling back all services..."
    foreach ($svc in $SERVICES) {
        Rollback-Service -ServiceName $svc -Commit $CommitSha
    }
    Write-Success "All services rolled back successfully"
} else {
    if ($SERVICES -notcontains $Service) {
        Write-Error-Custom "Service '$Service' not recognized. Valid services: $($SERVICES -join ', ')"
    }
    
    Rollback-Service -ServiceName $Service -Commit $CommitSha
}

# Verify health
Write-Log "Verifying service health..."

foreach ($svc in $SERVICES) {
    try {
        $running = aws ecs describe-services `
            --cluster $CLUSTER_NAME `
            --services $svc `
            --region $AwsRegion `
            --query 'services[0].runningCount' `
            --output text
        
        if ($running -gt 0) {
            Write-Success "Service $svc is running ($running tasks)"
        } else {
            Write-Warn "Service $svc has no running tasks"
        }
    } catch {
        Write-Warn "Could not check status for service $svc"
    }
}

# Summary
Write-Success "Rollback complete!"
Write-Log "Summary:"
Write-Log "  - Service(s): $Service"
if ($CommitSha) {
    Write-Log "  - Rolled back to commit: $CommitSha"
} else {
    Write-Log "  - Rolled back to previous version"
}
Write-Log "  - Time: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss UTC')"
Write-Log ""
Write-Log "Next steps:"
Write-Log "  1. Verify application functionality"
Write-Log "  2. Check logs: aws logs tail /aws/ecs/t3ck-cluster --follow"
Write-Log "  3. Investigate root cause"
Write-Log "  4. Fix and re-deploy when ready"
