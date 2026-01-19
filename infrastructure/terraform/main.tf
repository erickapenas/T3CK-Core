terraform {
  required_version = ">= 1.5.0"
  
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
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

# Variáveis
variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "production"
}

variable "project_name" {
  description = "Project name"
  type        = string
  default     = "t3ck"
}

# Outputs
output "vpc_id" {
  value = module.networking.vpc_id
}

output "public_subnet_ids" {
  value = module.networking.public_subnet_ids
}

output "private_subnet_ids" {
  value = module.networking.private_subnet_ids
}

output "alb_security_group_id" {
  value = module.security.alb_security_group_id
}

output "ecs_security_group_id" {
  value = module.security.ecs_security_group_id
}

output "s3_bucket_logs" {
  value = module.storage.s3_bucket_logs
}

output "s3_bucket_artifacts" {
  value = module.storage.s3_bucket_artifacts
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
