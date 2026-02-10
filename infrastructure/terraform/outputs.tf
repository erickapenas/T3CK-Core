output "vpc_id" {
  description = "VPC ID"
  value       = module.networking.vpc_id
}

output "public_subnet_ids" {
  description = "Public subnet IDs"
  value       = module.networking.public_subnet_ids
}

output "private_subnet_ids" {
  description = "Private subnet IDs"
  value       = module.networking.private_subnet_ids
}

output "alb_security_group_id" {
  description = "ALB security group ID"
  value       = module.security.alb_security_group_id
}

output "ecs_security_group_id" {
  description = "ECS security group ID"
  value       = module.security.ecs_security_group_id
}

output "s3_bucket_logs" {
  description = "S3 bucket for logs"
  value       = module.storage.s3_bucket_logs
}

output "s3_bucket_artifacts" {
  description = "S3 bucket for artifacts"
  value       = module.storage.s3_bucket_artifacts
}

output "ecs_task_execution_role_arn" {
  description = "ECS task execution role ARN"
  value       = module.iam.ecs_task_execution_role_arn
}

output "ecs_task_role_arn" {
  description = "ECS task role ARN"
  value       = module.iam.ecs_task_role_arn
}

output "lambda_role_arn" {
  description = "Lambda role ARN"
  value       = module.iam.lambda_role_arn
}

output "database_secret_arn" {
  description = "Secrets Manager ARN for database credentials"
  value       = module.secrets.database_secret_arn
}

output "database_security_group_id" {
  description = "Database security group ID"
  value       = module.security.database_security_group_id
}

output "db_endpoint" {
  description = "RDS endpoint"
  value       = module.database.db_endpoint
}

output "db_port" {
  description = "RDS port"
  value       = module.database.db_port
}

output "db_name" {
  description = "RDS database name"
  value       = module.database.db_name
}

output "db_username" {
  description = "RDS master username"
  value       = module.database.db_username
}

output "cache_primary_endpoint" {
  description = "Redis primary endpoint"
  value       = module.cache.cache_primary_endpoint
}

output "cache_reader_endpoint" {
  description = "Redis reader endpoint"
  value       = module.cache.cache_reader_endpoint
}

output "cache_port" {
  description = "Redis port"
  value       = module.cache.cache_port
}
