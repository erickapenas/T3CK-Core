variable "project_name" {
  type = string
}

# Hosted Zone (se já existir, usar data source)
data "aws_route53_zone" "main" {
  name         = "${var.project_name}.com"
  private_zone = false
}

# Outputs
output "hosted_zone_id" {
  value = data.aws_route53_zone.main.zone_id
}

output "hosted_zone_name" {
  value = data.aws_route53_zone.main.name
}
