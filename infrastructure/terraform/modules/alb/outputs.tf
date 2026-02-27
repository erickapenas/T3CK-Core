output "target_group_arn" {
  description = "ARN of the target group"
  value       = aws_lb_target_group.main.arn
}

output "target_group_name" {
  description = "Name of the target group"
  value       = aws_lb_target_group.main.name
}

output "target_group_arn_suffix" {
  description = "ARN suffix of the target group (for use with metrics)"
  value       = aws_lb_target_group.main.arn_suffix
}

output "grpc_target_group_arn" {
  description = "ARN of the gRPC target group"
  value       = try(aws_lb_target_group.grpc[0].arn, null)
}

output "https_listener_arn" {
  description = "ARN of the HTTPS listener"
  value       = aws_lb_listener.https.arn
}

output "http_listener_arn" {
  description = "ARN of the HTTP listener"
  value       = aws_lb_listener.http.arn
}

output "alb_logs_bucket_id" {
  description = "ID of the S3 bucket for ALB logs"
  value       = aws_s3_bucket.alb_logs.id
}

output "alb_logs_bucket_arn" {
  description = "ARN of the S3 bucket for ALB logs"
  value       = aws_s3_bucket.alb_logs.arn
}

output "dashboard_url" {
  description = "CloudWatch dashboard URL for ALB metrics"
  value       = "https://console.aws.amazon.com/cloudwatch/home?region=${var.aws_region}#dashboards:name=t3ck-alb-${var.environment}"
}
