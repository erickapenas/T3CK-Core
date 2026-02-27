# ECS Auto Scaling Configuration
# Manages dynamic scaling based on CPU/memory metrics and request count

# CloudWatch metric for tracking application performance
resource "aws_cloudwatch_metric_alarm" "ecs_cpu_high" {
  alarm_name          = "t3ck-ecs-cpu-high-${var.environment}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  period              = 300
  statistic           = "Average"
  threshold           = var.cpu_threshold_high
  alarm_description   = "This metric monitors ECS CPU utilization"
  alarm_actions       = var.alarm_actions

  dimensions = {
    ServiceName = var.ecs_service_name
    ClusterName = var.ecs_cluster_name
  }
}

resource "aws_cloudwatch_metric_alarm" "ecs_cpu_low" {
  alarm_name          = "t3ck-ecs-cpu-low-${var.environment}"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 15
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  period              = 300
  statistic           = "Average"
  threshold           = var.cpu_threshold_low
  alarm_description   = "This metric monitors ECS CPU underutilization"

  dimensions = {
    ServiceName = var.ecs_service_name
    ClusterName = var.ecs_cluster_name
  }
}

# AppAutoScaling Target for ECS Service
resource "aws_appautoscaling_target" "ecs_service_target" {
  max_capacity       = var.max_capacity
  min_capacity       = var.min_capacity
  resource_id        = "service/${var.ecs_cluster_name}/${var.ecs_service_name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

# Scale Up Policy - CPU based
resource "aws_appautoscaling_policy" "ecs_policy_cpu_up" {
  name               = "t3ck-scale-up-cpu-${var.environment}"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs_service_target.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs_service_target.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs_service_target.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value = var.cpu_target_value
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

# Scale Policy - Memory based
resource "aws_appautoscaling_policy" "ecs_policy_memory" {
  name               = "t3ck-scale-memory-${var.environment}"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs_service_target.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs_service_target.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs_service_target.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageMemoryUtilization"
    }
    target_value = var.memory_target_value
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

# Scale Policy - ALB Request Count
resource "aws_appautoscaling_policy" "ecs_policy_alb_request_count" {
  name               = "t3ck-scale-requests-${var.environment}"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs_service_target.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs_service_target.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs_service_target.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ALBRequestCountPerTarget"
      resource_label         = var.alb_target_group_arn_suffix
    }
    target_value = var.requests_per_target
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

# Step Scaling Policy for aggressive scale-up during traffic spikes
resource "aws_autoscaling_policy" "ecs_policy_step_up" {
  name                   = "t3ck-step-scale-up-${var.environment}"
  scaling_adjustment     = 100
  adjustment_type        = "PercentChangeInCapacity"
  policy_type            = "StepScaling"
  estimated_warmup_seconds = 300
}

resource "aws_autoscaling_policy" "ecs_policy_step_down" {
  name                   = "t3ck-step-scale-down-${var.environment}"
  scaling_adjustment     = -50
  adjustment_type        = "PercentChangeInCapacity"
  policy_type            = "StepScaling"
  estimated_warmup_seconds = 300
}

# Scheduled Scaling Actions (if needed)
resource "aws_appautoscaling_scheduled_action" "scale_up_morning" {
  count = var.enable_scheduled_scaling ? 1 : 0

  service_namespace  = aws_appautoscaling_target.ecs_service_target.service_namespace
  resource_id        = aws_appautoscaling_target.ecs_service_target.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs_service_target.scalable_dimension
  schedule           = var.morning_scale_schedule

  scalable_target_action {
    min_capacity = var.min_capacity_morning
    max_capacity = var.max_capacity_morning
  }
}

resource "aws_appautoscaling_scheduled_action" "scale_down_evening" {
  count = var.enable_scheduled_scaling ? 1 : 0

  service_namespace  = aws_appautoscaling_target.ecs_service_target.service_namespace
  resource_id        = aws_appautoscaling_target.ecs_service_target.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs_service_target.scalable_dimension
  schedule           = var.evening_scale_schedule

  scalable_target_action {
    min_capacity = var.min_capacity_evening
    max_capacity = var.max_capacity_evening
  }
}

# SNS Topic for scaling notifications
resource "aws_sns_topic" "ecs_scaling_events" {
  name = "t3ck-ecs-scaling-${var.environment}"

  tags = {
    Environment = var.environment
  }
}

resource "aws_sns_topic_subscription" "ecs_scaling_email" {
  count     = var.notification_email != "" ? 1 : 0
  topic_arn = aws_sns_topic.ecs_scaling_events.arn
  protocol  = "email"
  endpoint  = var.notification_email
}

# EventBridge rule to send scaling notifications
resource "aws_cloudwatch_event_rule" "ecs_scaling_events" {
  name        = "t3ck-ecs-scaling-events-${var.environment}"
  description = "Capture ECS scaling events"

  event_pattern = jsonencode({
    source      = ["aws.autoscaling"]
    detail-type = ["EC2 Instance Launch Successful", "EC2 Instance Terminate Successful"]
    detail = {
      AutoScalingGroupName = [var.ecs_cluster_name]
    }
  })
}

resource "aws_cloudwatch_event_target" "ecs_scaling_sns" {
  rule      = aws_cloudwatch_event_rule.ecs_scaling_events.name
  target_id = "SendToSNS"
  arn       = aws_sns_topic.ecs_scaling_events.arn

  input_transformer {
    input_paths = {
      detail = "$.detail"
    }
    input_template = "\"ECS Scaling Event: <detail>\""
  }
}

# CloudWatch Dashboard for scaling metrics
resource "aws_cloudwatch_dashboard" "ecs_scaling" {
  dashboard_name = "t3ck-ecs-scaling-${var.environment}"

  dashboard_body = jsonencode({
    widgets = [
      {
        type = "metric"
        properties = {
          metrics = [
            ["AWS/ECS", "CPUUtilization", { stat = "Average" }],
            [".", "MemoryUtilization", { stat = "Average" }],
            ["AWS/ApplicationELB", "TargetResponseTime", { stat = "Average" }],
            [".", "RequestCount", { stat = "Sum" }]
          ]
          period = 300
          stat   = "Average"
          region = var.aws_region
          title  = "ECS Service Metrics"
        }
      }
    ]
  })
}
