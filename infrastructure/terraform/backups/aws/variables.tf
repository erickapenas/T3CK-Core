variable "region" {
  type    = string
  default = "us-east-1"
}

variable "backup_image" {
  type = string
}

variable "s3_bucket" {
  type = string
}

variable "cpu" {
  type    = number
  default = 256
}

variable "memory" {
  type    = number
  default = 512
}

variable "execution_role_arn" {
  type = string
}

variable "subnets" {
  type = list(string)
}

variable "security_groups" {
  type = list(string)
}

variable "assign_public_ip" {
  type    = bool
  default = false
}

variable "schedule_expression" {
  type    = string
  default = "cron(0 3 * * ? *)" # daily at 03:00 UTC
}
