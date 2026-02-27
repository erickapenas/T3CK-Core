variable "alb_id" {
  description = "ID of the Application Load Balancer"
  type        = string
}

variable "alb_arn" {
  description = "ARN of the Application Load Balancer"
  type        = string
}

variable "alb_name" {
  description = "Name of the Application Load Balancer"
  type        = string
}

variable "alb_security_group_id" {
  description = "Security group ID of the ALB"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID where target group will be created"
  type        = string
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "target_port" {
  description = "Port for target group"
  type        = number
  default     = 3000
}

variable "target_protocol" {
  description = "Protocol for target group"
  type        = string
  default     = "HTTP"
  validation {
    condition     = contains(["HTTP", "HTTPS", "TCP", "UDP", "TCP_UDP"], var.target_protocol)
    error_message = "Must be one of: HTTP, HTTPS, TCP, UDP, TCP_UDP"
  }
}

variable "health_check_path" {
  description = "Path for health check endpoint"
  type        = string
  default     = "/health"
}

variable "enable_sticky_sessions" {
  description = "Enable sticky sessions (cookie-based)"
  type        = bool
  default     = true
}

variable "ssl_certificate_arn" {
  description = "ARN of SSL certificate for HTTPS listener"
  type        = string
}

variable "enable_grpc" {
  description = "Enable gRPC service support"
  type        = bool
  default     = false
}

variable "grpc_port" {
  description = "Port for gRPC service"
  type        = number
  default     = 50051
}

variable "alarm_actions" {
  description = "List of SNS topic ARNs for alarm notifications"
  type        = list(string)
  default     = []
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}
