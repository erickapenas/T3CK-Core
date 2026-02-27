output "autoscaling_target_id" {
  description = "ID of the App Auto Scaling target"
  value       = aws_appautoscaling_target.ecs_service_target.id
}

output "autoscaling_target_arn" {
  description = "ARN of the App Auto Scaling target"
  value       = aws_appautoscaling_target.ecs_service_target.arn
}

output "cpu_scaling_policy_arn" {
  description = "ARN of the CPU-based scaling policy"
  value       = aws_appautoscaling_policy.ecs_policy_cpu_up.arn
}

output "memory_scaling_policy_arn" {
  description = "ARN of the memory-based scaling policy"
  value       = aws_appautoscaling_policy.ecs_policy_memory.arn
}

output "alb_scaling_policy_arn" {
  description = "ARN of the ALB request count scaling policy"
  value       = aws_appautoscaling_policy.ecs_policy_alb_request_count.arn
}

output "sns_topic_arn" {
  description = "ARN of SNS topic for scaling events"
  value       = aws_sns_topic.ecs_scaling_events.arn
}

output "dashboard_url" {
  description = "CloudWatch dashboard URL for monitoring scaling metrics"
  value       = "https://console.aws.amazon.com/cloudwatch/home?region=${var.aws_region}#dashboards:name=t3ck-ecs-scaling-${var.environment}"
}
