output "cache_primary_endpoint" {
  value = aws_elasticache_replication_group.main.primary_endpoint_address
}

output "cache_reader_endpoint" {
  value = aws_elasticache_replication_group.main.reader_endpoint_address
}

output "cache_port" {
  value = aws_elasticache_replication_group.main.port
}
