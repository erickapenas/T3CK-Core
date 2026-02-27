output "web_acl_id" {
  description = "ID of the WAF WebACL"
  value       = aws_wafv2_web_acl.main.id
}

output "web_acl_arn" {
  description = "ARN of the WAF WebACL"
  value       = aws_wafv2_web_acl.main.arn
}

output "web_acl_capacity" {
  description = "Capacity consumed by the WebACL"
  value       = aws_wafv2_web_acl.main.capacity
}

output "log_group_name" {
  description = "CloudWatch log group for WAF logs"
  value       = aws_cloudwatch_log_group.waf_logs.name
}

output "blacklist_ip_set_arn" {
  description = "ARN of the IP blacklist set"
  value       = aws_wafv2_ip_set.blacklist.arn
}
