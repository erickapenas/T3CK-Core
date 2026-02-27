output "state_bucket_id" {
  description = "ID of the Terraform state S3 bucket"
  value       = aws_s3_bucket.terraform_state.id
}

output "state_bucket_arn" {
  description = "ARN of the Terraform state S3 bucket"
  value       = aws_s3_bucket.terraform_state.arn
}

output "state_bucket_region" {
  description = "AWS region of the state bucket"
  value       = aws_s3_bucket.terraform_state.region
}

output "locks_table_name" {
  description = "Name of the DynamoDB locks table"
  value       = aws_dynamodb_table.terraform_locks.name
}

output "locks_table_arn" {
  description = "ARN of the DynamoDB locks table"
  value       = aws_dynamodb_table.terraform_locks.arn
}

output "kms_key_id" {
  description = "KMS key ID for state encryption"
  value       = aws_kms_key.terraform_state.id
}

output "kms_key_arn" {
  description = "KMS key ARN for state encryption"
  value       = aws_kms_key.terraform_state.arn
}

output "backend_config" {
  description = "Backend configuration to use in Terraform"
  value       = {
    bucket         = aws_s3_bucket.terraform_state.id
    key            = "terraform.tfstate"
    region         = aws_s3_bucket.terraform_state.region
    dynamodb_table = aws_dynamodb_table.terraform_locks.name
    encrypt        = true
    kms_key_id     = aws_kms_key.terraform_state.id
  }
}

output "logs_bucket_id" {
  description = "ID of the Terraform logs S3 bucket"
  value       = aws_s3_bucket.terraform_logs.id
}
