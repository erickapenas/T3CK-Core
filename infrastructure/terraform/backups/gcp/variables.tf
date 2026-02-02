variable "project" {
  type = string
}

variable "region" {
  type    = string
  default = "us-central1"
}

variable "backup_image" {
  type = string
}

variable "s3_bucket" {
  type = string
}

variable "firestore_export_prefix" {
  type = string
  default = "firestore-backups"
}

variable "invoker_member" {
  type = string
  default = "allUsers" # change for restricted invocation
}

variable "run_service_account" {
  type = string
}

variable "cron_schedule" {
  type    = string
  default = "0 3 * * *" # daily at 03:00
}

variable "time_zone" {
  type    = string
  default = "UTC"
}
