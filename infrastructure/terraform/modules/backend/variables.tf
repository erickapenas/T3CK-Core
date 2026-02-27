variable "state_bucket_name" {
  description = "Name of S3 bucket for Terraform state"
  type        = string
  default     = "t3ck-terraform-state"
}

variable "logs_bucket_name" {
  description = "Name of S3 bucket for state access logs"
  type        = string
  default     = "t3ck-terraform-logs"
}

variable "locks_table_name" {
  description = "Name of DynamoDB table for state locking"
  type        = string
  default     = "t3ck-terraform-locks"
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "enable_mfa_delete" {
  description = "Enable MFA delete on state bucket (requires root account)"
  type        = bool
  default     = false
}

variable "state_retention_days" {
  description = "Number of days to retain state file versions"
  type        = number
  default     = 90
}
