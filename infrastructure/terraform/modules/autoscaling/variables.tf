variable "ecs_cluster_name" {
  description = "Name of the ECS cluster"
  type        = string
}

variable "ecs_service_name" {
  description = "Name of the ECS service to scale"
  type        = string
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "min_capacity" {
  description = "Minimum number of running tasks"
  type        = number
  default     = 2
}

variable "max_capacity" {
  description = "Maximum number of running tasks"
  type        = number
  default     = 10
}

variable "cpu_target_value" {
  description = "Target CPU utilization percentage (0-100)"
  type        = number
  default     = 70
}

variable "memory_target_value" {
  description = "Target memory utilization percentage (0-100)"
  type        = number
  default     = 80
}

variable "cpu_threshold_high" {
  description = "CPU threshold for scale-up alarm (percentage)"
  type        = number
  default     = 85
}

variable "cpu_threshold_low" {
  description = "CPU threshold for scale-down alarm (percentage)"
  type        = number
  default     = 25
}

variable "alarm_actions" {
  description = "List of SNS topic ARNs for alarm notifications"
  type        = list(string)
  default     = []
}

variable "requests_per_target" {
  description = "Target number of requests per target per minute"
  type        = number
  default     = 1000
}

variable "alb_target_group_arn_suffix" {
  description = "ARN suffix of the ALB target group"
  type        = string
}

variable "enable_scheduled_scaling" {
  description = "Enable time-based scaling schedules"
  type        = bool
  default     = false
}

variable "morning_scale_schedule" {
  description = "Cron expression for morning scale-up (UTC)"
  type        = string
  default     = "cron(0 8 ? * MON-FRI *)"
}

variable "evening_scale_schedule" {
  description = "Cron expression for evening scale-down (UTC)"
  type        = string
  default     = "cron(0 18 ? * MON-FRI *)"
}

variable "min_capacity_morning" {
  description = "Minimum capacity during business hours"
  type        = number
  default     = 3
}

variable "max_capacity_morning" {
  description = "Maximum capacity during business hours"
  type        = number
  default     = 20
}

variable "min_capacity_evening" {
  description = "Minimum capacity during off-hours"
  type        = number
  default     = 1
}

variable "max_capacity_evening" {
  description = "Maximum capacity during off-hours"
  type        = number
  default     = 5
}

variable "notification_email" {
  description = "Email address for scaling notifications"
  type        = string
  default     = ""
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}
