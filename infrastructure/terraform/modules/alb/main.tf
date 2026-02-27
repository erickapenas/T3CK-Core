# Application Load Balancer (ALB) with advanced configuration
# Target groups, health checks, sticky sessions, SSL/TLS termination

# Create target group for HTTP/2 services
resource "aws_lb_target_group" "main" {
  name        = "t3ck-tg-${var.environment}"
  port        = var.target_port
  protocol    = var.target_protocol
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    enabled             = true
    healthy_threshold   = 3
    unhealthy_threshold = 2
    timeout             = 5
    interval            = 30
    path                = var.health_check_path
    matcher             = "200-299"
    protocol            = "HTTP"
  }

  stickiness {
    type            = "lb_cookie"
    enabled         = var.enable_sticky_sessions
    cookie_duration = 86400
  }

  tags = {
    Name        = "t3ck-target-group-${var.environment}"
    Environment = var.environment
  }

  depends_on = [var.alb_id]
}

# Target group for gRPC services (if needed)
resource "aws_lb_target_group" "grpc" {
  count       = var.enable_grpc ? 1 : 0
  name        = "t3ck-grpc-tg-${var.environment}"
  port        = var.grpc_port
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"
  protocol_version = "GRPC"

  health_check {
    enabled             = true
    healthy_threshold   = 3
    unhealthy_threshold = 2
    timeout             = 5
    interval            = 30
    path                = "/grpc.health.v1.Health/Check"
    matcher             = "0"
  }

  tags = {
    Name        = "t3ck-grpc-target-group-${var.environment}"
    Environment = var.environment
  }
}

# ALB Listener for HTTPS traffic
resource "aws_lb_listener" "https" {
  load_balancer_arn = var.alb_arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS-1-2-2017-01"
  certificate_arn   = var.ssl_certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.main.arn
  }

  depends_on = [aws_lb_target_group.main]
}

# ALB Listener for HTTP traffic (redirect to HTTPS)
resource "aws_lb_listener" "http" {
  load_balancer_arn = var.alb_arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"

    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

# Listener rule for API endpoints
resource "aws_lb_listener_rule" "api" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 10

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.main.arn
  }

  condition {
    path_pattern {
      values = ["/api/*"]
    }
  }
}

# Listener rule for health checks
resource "aws_lb_listener_rule" "health" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 5

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.main.arn
  }

  condition {
    path_pattern {
      values = ["/health", "/health/*"]
    }
  }
}

# Listener rule for gRPC services
resource "aws_lb_listener_rule" "grpc" {
  count            = var.enable_grpc ? 1 : 0
  listener_arn     = aws_lb_listener.https.arn
  priority         = 15

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.grpc[0].arn
  }

  condition {
    path_pattern {
      values = ["/grpc/*"]
    }
  }
}

# Additional listener for websocket support
resource "aws_lb_listener_rule" "websocket" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 20

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.main.arn
  }

  condition {
    http_header {
      http_header_name = "Upgrade"
      values           = ["websocket"]
    }
  }
}

# ALB security group rules
resource "aws_security_group_rule" "alb_https" {
  type              = "ingress"
  from_port         = 443
  to_port           = 443
  protocol          = "tcp"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = var.alb_security_group_id
  description       = "Allow HTTPS from anywhere"
}

resource "aws_security_group_rule" "alb_http" {
  type              = "ingress"
  from_port         = 80
  to_port           = 80
  protocol          = "tcp"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = var.alb_security_group_id
  description       = "Allow HTTP from anywhere (will redirect to HTTPS)"
}

# Access logs for ALB
resource "aws_s3_bucket" "alb_logs" {
  bucket = "t3ck-alb-logs-${var.environment}-${data.aws_caller_identity.current.account_id}"

  tags = {
    Name        = "alb-logs-${var.environment}"
    Environment = var.environment
  }
}

resource "aws_s3_bucket_public_access_block" "alb_logs" {
  bucket = aws_s3_bucket.alb_logs.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "alb_logs" {
  bucket = aws_s3_bucket.alb_logs.id

  rule {
    id     = "delete-logs-90days"
    status = "Enabled"

    expiration {
      days = 90
    }
  }
}

# Enable ALB access logging
resource "aws_lb" "alb" {
  access_logs {
    bucket  = aws_s3_bucket.alb_logs.id
    prefix  = "alb-logs"
    enabled = true
  }
}

# CloudWatch alarms for ALB health
resource "aws_cloudwatch_metric_alarm" "unhealthy_hosts" {
  alarm_name          = "t3ck-alb-unhealthy-hosts-${var.environment}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "UnHealthyHostCount"
  namespace           = "AWS/ApplicationELB"
  period              = 300
  statistic           = "Average"
  threshold           = 0
  alarm_description   = "Alert when ALB has unhealthy targets"
  alarm_actions       = var.alarm_actions

  dimensions = {
    LoadBalancer = var.alb_name
    TargetGroup  = aws_lb_target_group.main.name
  }
}

resource "aws_cloudwatch_metric_alarm" "target_response_time" {
  alarm_name          = "t3ck-alb-response-time-${var.environment}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "TargetResponseTime"
  namespace           = "AWS/ApplicationELB"
  period              = 300
  statistic           = "Average"
  threshold           = 1.0
  alarm_description   = "Alert when ALB response time is high"
  alarm_actions       = var.alarm_actions

  dimensions = {
    LoadBalancer = var.alb_name
  }
}

# Current AWS account data
data "aws_caller_identity" "current" {}

# CloudWatch dashboard for ALB metrics
resource "aws_cloudwatch_dashboard" "alb_metrics" {
  dashboard_name = "t3ck-alb-${var.environment}"

  dashboard_body = jsonencode({
    widgets = [
      {
        type = "metric"
        properties = {
          metrics = [
            ["AWS/ApplicationELB", "TargetResponseTime", { stat = "Average" }],
            [".", "RequestCount", { stat = "Sum" }],
            [".", "HealthyHostCount", { stat = "Average" }],
            [".", "UnHealthyHostCount", { stat = "Average" }],
            [".", "HTTPCode_Target_5XX_Count", { stat = "Sum" }],
            [".", "HTTPCode_Target_4XX_Count", { stat = "Sum" }]
          ]
          period = 60
          stat   = "Average"
          region = var.aws_region
          title  = "ALB Health & Performance"
        }
      }
    ]
  })
}
