resource "aws_elasticache_subnet_group" "main" {
  name       = "${var.project_name}-${var.environment}-cache-subnet-group"
  subnet_ids = var.subnet_ids

  tags = {
    Name        = "${var.project_name}-${var.environment}-cache-subnet-group"
    Environment = var.environment
    Project     = var.project_name
  }
}

resource "aws_elasticache_replication_group" "main" {
  replication_group_id       = "${var.project_name}-${var.environment}-redis"
  description                = "T3CK Redis replication group"
  engine                     = "redis"
  engine_version             = var.cache_engine_version
  node_type                  = var.cache_node_type
  port                       = 6379
  num_cache_clusters         = var.cache_num_nodes
  automatic_failover_enabled = var.cache_automatic_failover
  multi_az_enabled           = var.cache_multi_az
  at_rest_encryption_enabled = var.cache_at_rest_encryption
  transit_encryption_enabled = var.cache_transit_encryption

  subnet_group_name  = aws_elasticache_subnet_group.main.name
  security_group_ids = [var.security_group_id]

  tags = {
    Name        = "${var.project_name}-${var.environment}-redis"
    Environment = var.environment
    Project     = var.project_name
  }
}
