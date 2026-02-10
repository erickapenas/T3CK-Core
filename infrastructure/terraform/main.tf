terraform {
  required_version = ">= 1.5.0"
  
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  backend "s3" {
    bucket = "t3ck-terraform-state"
    key    = "terraform.tfstate"
    region = "us-east-1"
  }
}

provider "aws" {
  region = var.aws_region
}

resource "random_password" "db_password" {
  count = var.db_password == "" && var.db_password_auto ? 1 : 0

  length           = 32
  special          = true
  override_special = "_-%+!#@"
}

locals {
  db_password_effective = var.db_password != "" ? var.db_password : (
    var.db_password_auto ? random_password.db_password[0].result : ""
  )
}

# Módulos
module "networking" {
  source = "./modules/networking"
  
  project_name = var.project_name
  environment  = var.environment
  aws_region   = var.aws_region
}

module "security" {
  source = "./modules/security"
  
  vpc_id = module.networking.vpc_id
}

module "iam" {
  source = "./modules/iam"
  
  project_name = var.project_name
  environment  = var.environment
}

module "storage" {
  source = "./modules/storage"
  
  project_name = var.project_name
  environment  = var.environment
}

module "route53" {
  source = "./modules/route53"
  
  project_name = var.project_name
}

module "secrets" {
  source = "./modules/secrets"
  
  project_name = var.project_name
  environment  = var.environment
}

resource "aws_secretsmanager_secret_version" "database" {
  secret_id = module.secrets.database_secret_arn

  secret_string = jsonencode({
    host     = module.database.db_endpoint
    port     = module.database.db_port
    name     = module.database.db_name
    username = var.db_username
    password = local.db_password_effective
  })
}

module "database" {
  source = "./modules/database"

  project_name       = var.project_name
  environment        = var.environment
  vpc_id             = module.networking.vpc_id
  subnet_ids         = module.networking.private_subnet_ids
  security_group_id  = module.security.database_security_group_id
  db_name            = var.db_name
  db_username        = var.db_username
  db_password        = local.db_password_effective
  db_instance_class  = var.db_instance_class
  db_allocated_storage     = var.db_allocated_storage
  db_max_allocated_storage = var.db_max_allocated_storage
  db_engine_version        = var.db_engine_version
  db_multi_az              = var.db_multi_az
  db_backup_retention      = var.db_backup_retention
  db_deletion_protection   = var.db_deletion_protection
  db_publicly_accessible   = var.db_publicly_accessible
  db_skip_final_snapshot   = var.db_skip_final_snapshot
  db_storage_encrypted     = var.db_storage_encrypted
}

module "cache" {
  source = "./modules/cache"

  project_name       = var.project_name
  environment        = var.environment
  vpc_id             = module.networking.vpc_id
  subnet_ids         = module.networking.private_subnet_ids
  security_group_id  = module.security.redis_security_group_id
  cache_node_type    = var.cache_node_type
  cache_engine_version      = var.cache_engine_version
  cache_num_nodes            = var.cache_num_nodes
  cache_multi_az             = var.cache_multi_az
  cache_automatic_failover   = var.cache_automatic_failover
  cache_at_rest_encryption   = var.cache_at_rest_encryption
  cache_transit_encryption   = var.cache_transit_encryption
}
