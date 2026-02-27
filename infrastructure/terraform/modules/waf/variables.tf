variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "alb_arn" {
  description = "ARN of the Application Load Balancer to protect"
  type        = string
}

variable "rate_limit_threshold" {
  description = "Number of requests per 5-minute period before rate limit blocks"
  type        = number
  default     = 2000
}

variable "enable_geo_blocking" {
  description = "Enable geographic IP blocking"
  type        = bool
  default     = false
}

variable "blocked_countries" {
  description = "List of country codes to block (ISO 3166-1 alpha-2)"
  type        = list(string)
  default     = []
}

variable "blocked_ips" {
  description = "List of IP addresses/CIDR blocks to blacklist"
  type        = list(string)
  default     = []
}

variable "enable_logging" {
  description = "Enable WAF logging to CloudWatch"
  type        = bool
  default     = true
}
