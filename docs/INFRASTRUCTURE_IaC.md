# Infrastructure as Code (IaC) Implementation Guide

## Overview
This document covers the infrastructure components implemented for T3CK production deployment, including Terraform modules for backend state management, WAF protection, auto-scaling, and load balancer configuration.

## 1. Terraform Remote Backend

### Purpose
Secure, centralized state management with locking to prevent concurrent modifications.

### Components
- **S3 Bucket** (`terraform-state-{environment}`)
  - Versioning enabled for rollback capability
  - KMS encryption with customer-managed key
  - Public access blocked
  - Access logging to separate bucket
  
- **DynamoDB Table** (`terraform-locks-{environment}`)
  - State locking prevents terraform race conditions
  - TTL enabled for automatic cleanup of stale locks
  - PAY_PER_REQUEST billing (no capacity planning needed)
  - Point-in-time recovery enabled
  - Encrypted with KMS

- **KMS Key** (automatic rotation enabled)
  - Encrypts both S3 and DynamoDB
  - Cross-account access possible via key policy

### Backend Configuration

Add to your root `main.tf`:

```hcl
terraform {
  backend "s3" {
    bucket         = "t3ck-terraform-state"
    key            = "terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "t3ck-terraform-locks"
    encrypt        = true
    kms_key_id     = "arn:aws:kms:..."
  }
}
```

### Migration Steps

1. **Initialize local state** (if first time):
   ```bash
   terraform init
   ```

2. **Create backend module**:
   ```bash
   cd infrastructure/terraform/modules/backend
   terraform init && terraform apply
   ```

3. **Migrate to remote state**:
   ```bash
   # In root workspace
   terraform init -reconfigure \
     -backend-config="bucket=t3ck-terraform-state" \
     -backend-config="key=terraform.tfstate" \
     -backend-config="region=us-east-1" \
     -backend-config="dynamodb_table=t3ck-terraform-locks" \
     -backend-config="encrypt=true"
   
   # Confirm migration
   terraform state list
   ```

### Security Best Practices
- ✅ KMS encryption at rest
- ✅ TLS enforcement (SSL/TLS only)
- ✅ Public access blocked
- ✅ Versioning enabled
- ✅ Access logging audited
- ✅ State locking prevents corruption

---

## 2. AWS WAF (Web Application Firewall)

### Purpose
Protect load balancer against common web attacks, rate limiting, and geographical restrictions.

### Rules Included

1. **AWS Managed Rule Sets**
   - `AWSManagedRulesCommonRuleSet` - OWASP Top 10 (SQL injection, XSS, etc.)
   - `AWSManagedRulesSQLiRuleSet` - SQL injection prevention
   - `AWSManagedRulesKnownBadInputsRuleSet` - Common bad input patterns
   - `AWSManagedRulesAmazonIpReputationList` - Threat intelligence

2. **Rate Limiting**
   - Default: 2000 requests per 5-minute period per IP
   - Scope: `/api/*` endpoints
   - Customizable threshold

3. **Geographic Blocking** (optional)
   - Countries configurable via `blocked_countries` variable
   - ISO 3166-1 alpha-2 format (e.g., `CN`, `RU`)

4. **IP Blacklist**
   - Manual IPs/CIDR blocks via `blocked_ips` variable
   - Automatic refresh capability

5. **Custom Rules**
   - API key header validation
   - Request URI pattern matching

### CloudWatch Monitoring
- All rule matches logged to CloudWatch Logs
- 30-day retention
- Sampled requests captured for inspection

### Configuration Example

```hcl
module "waf" {
  source = "./modules/waf"
  
  alb_arn                = aws_lb.main.arn
  rate_limit_threshold   = 2000
  enable_geo_blocking    = true
  blocked_countries      = ["CN", "KP"]    # China, North Korea
  blocked_ips            = ["203.0.113.0/24"]
  
  environment = var.environment
}
```

### Testing WAF Rules

```bash
# Simulate SQL injection (should be blocked)
curl -X GET "https://api.example.com/api/users?id=1' OR '1'='1"

# Rate limit test
for i in {1..3000}; do 
  curl https://api.example.com/api/data &
done
wait

# Check logs
aws logs tail /aws/waf/dev --follow
```

---

## 3. Auto Scaling Groups for ECS

### Purpose
Automatically scale ECS service tasks based on CPU, memory, and request count metrics.

### Scaling Policies

1. **CPU Utilization Target Tracking**
   - Default target: 70% average
   - Scale-out cooldown: 60 seconds
   - Scale-in cooldown: 300 seconds

2. **Memory Utilization Target Tracking**
   - Default target: 80% average
   - Same cooldown windows as CPU

3. **ALB Request Count**
   - Default: 1000 requests per target per minute
   - Request-based scaling most accurate for microservices

4. **Scheduled Scaling** (optional)
   - Morning scale-up: 8 AM UTC on weekdays
   - Evening scale-down: 6 PM UTC on weekdays

### Capacity Limits
```
Production defaults:
  - Min tasks: 2 (ensures availability)
  - Max tasks: 10 (cost control)
  
Business hours:
  - Min: 3, Max: 20
  
Off-hours:
  - Min: 1, Max: 5
```

### CloudWatch Alarms
- High CPU (>85%, trigger scale-up)
- Low CPU (<25%, trigger scale-down)
- Unhealthy hosts
- High ALB response time

### Configuration Example

```hcl
module "autoscaling" {
  source = "./modules/autoscaling"
  
  ecs_cluster_name           = aws_ecs_cluster.main.name
  ecs_service_name           = aws_ecs_service.api.name
  cpu_target_value           = 70
  memory_target_value        = 80
  requests_per_target        = 1000
  
  enable_scheduled_scaling   = true
  min_capacity_morning       = 3
  max_capacity_morning       = 20
  min_capacity_evening       = 1
  max_capacity_evening       = 5
  
  notification_email         = "ops@example.com"
}
```

### Monitoring

```bash
# View current task count
aws ecs describe-services \
  --cluster t3ck-prod \
  --services api-service \
  --query 'services[0].{DesiredCount,RunningCount,PendingCount}'

# View autoscaling events
aws application-autoscaling describe-scaling-activities \
  --service-namespace ecs \
  --resource-id service/t3ck-prod/api-service
```

---

## 4. Application Load Balancer (ALB) Advanced Config

### Purpose
Distribute traffic across ECS tasks with SSL/TLS termination, health checks, and sticky sessions.

### Components

#### Target Groups
- **Main HTTP/2 Target Group**
  - Port: 3000 (configurable)
  - Protocol: HTTP (ALB handles TLS termination)
  - Health checks every 30 seconds
  - Sticky sessions: enabled (24-hour cookie)

- **gRPC Target Group** (optional)
  - Protocol: gRPC/HTTP2
  - Health endpoint: `/grpc.health.v1.Health/Check`
  - Used for internal service-to-service RPC

#### Listeners
- **HTTPS (Port 443)**
  - TLS 1.2+ enforced
  - Certificate from ACM
  - Default target group: main
  
- **HTTP (Port 80)**
  - Redirects to HTTPS (301)
  - No content served

#### Listener Rules (Priority Order)
1. Health checks (path: `/health*`)
2. API endpoints (path: `/api/*`)
3. gRPC endpoints (path: `/grpc/*`)
4. WebSocket upgrade support

#### Security
- WAF attached to ALB
- Access logs to S3 (90-day retention)
- VPC security groups restrict ingress

### Health Check Configuration
```
Interval:             30 seconds
Timeout:              5 seconds
Healthy threshold:    3 consecutive passes
Unhealthy threshold:  2 consecutive failures

Response matcher:     Status 200-299
```

### Access Logs
- Bucket: `t3ck-alb-logs-{environment}-{account-id}`
- Prefix: `alb-logs/`
- Retention: 90 days
- Public access: blocked
- Encryption: SSE-S3

### CloudWatch Alarms
- Unhealthy host count (>0)
- Target response time (>1 second)

### Configuration Example

```hcl
module "alb" {
  source = "./modules/alb"
  
  alb_id               = aws_lb.main.id
  alb_arn              = aws_lb.main.arn
  alb_name             = aws_lb.main.name
  alb_security_group_id = aws_security_group.alb.id
  
  vpc_id               = var.vpc_id
  target_port          = 3000
  target_protocol      = "HTTP"
  health_check_path    = "/health"
  enable_sticky_sessions = true
  ssl_certificate_arn  = aws_acm_certificate.main.arn
  
  enable_grpc          = false
  
  environment          = var.environment
}
```

### Connection Handling
- **Connection Timeout:** 60 seconds
- **Idle Timeout:** 60 seconds
- **Desynchronization Protection:** Enabled
- **HTTP/2 Support:** Enabled
- **WebSocket Support:** Enabled via Upgrade header rule

### Deployment Integration

In your `main.tf`, compose the modules:

```hcl
module "backend" {
  source = "./modules/backend"
  state_bucket_name = "t3ck-terraform-state"
  locks_table_name  = "t3ck-terraform-locks"
  environment       = var.environment
}

module "waf" {
  source = "./modules/waf"
  alb_arn = aws_lb.main.arn
  environment = var.environment
}

module "autoscaling" {
  source = "./modules/autoscaling"
  ecs_cluster_name = aws_ecs_cluster.main.name
  ecs_service_name = aws_ecs_service.api.name
  environment = var.environment
}

module "alb" {
  source = "./modules/alb"
  alb_id = aws_lb.main.id
  ssl_certificate_arn = aws_acm_certificate.main.arn
  environment = var.environment
}
```

---

## Deployment Checklist

- [ ] Backend S3 + DynamoDB created and tested
- [ ] Terraform state migrated to remote backend
- [ ] WAF attached to ALB and rules validated
- [ ] Auto-scaling policies reviewed and thresholds tuned
- [ ] Health check endpoints returning 200
- [ ] SSL certificate valid and installed
- [ ] Access logs flowing to S3
- [ ] CloudWatch dashboards created
- [ ] Alarm notifications tested
- [ ] Load test performed to validate scaling

---

## Troubleshooting

### Terraform State Lock Stuck
```bash
# List locks
aws dynamodb scan --table-name t3ck-terraform-locks

# Force unlock (use with caution!)
terraform force-unlock <LOCK_ID>
```

### WAF Blocking Legitimate Traffic
- Check CloudWatch logs: `/aws/waf/environment`
- Review blocked requests in WAF console
- Add rule exceptions or modify rule groups

### ECS Tasks Not Scaling
- Verify cloudwatch metrics present
- Check autoscaling activity logs
- Review target group health

### ALB Returning 502
- Check ECS task health
- Verify security group rules (ALB → Tasks)
- Review target group health check configuration

