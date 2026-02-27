variable "project_name" {
  description = "Project name"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "backup_retention_days" {
  description = "Retention period (days) for backup objects"
  type        = number
  default     = 365
}
