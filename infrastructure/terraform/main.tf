terraform {
  required_version = ">= 1.5.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  backend "gcs" {
    bucket = "t3ck-terraform-state"
    prefix = "terraform/state"
  }
}

provider "google" {
  project = var.gcp_project_id
  region  = var.gcp_region
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

# ===================================
# GCP CLOUD STORAGE - Terraform State Bucket
# ===================================
resource "google_storage_bucket" "terraform_state" {
  name          = "${var.gcp_project_id}-terraform-state"
  location      = var.gcp_region
  force_destroy = false

  versioning {
    enabled = true
  }

  encryption {
    default_kms_key_name = google_kms_crypto_key.terraform_state_key.id
  }

  uniform_bucket_level_access = true

  lifecycle {
    prevent_destroy = true
  }

  labels = {
    env     = var.environment
    project = var.project_name
  }
}

# ===================================
# KMS KEY FOR TERRAFORM STATE ENCRYPTION
# ===================================
resource "google_kms_key_ring" "terraform" {
  name     = "${var.project_name}-terraform-keyring"
  location = var.gcp_region
}

resource "google_kms_crypto_key" "terraform_state_key" {
  name            = "${var.project_name}-terraform-state-key"
  key_ring        = google_kms_key_ring.terraform.id
  rotation_period = "7776000s" # 90 days

  lifecycle {
    prevent_destroy = true
  }
}

# ===================================
# Módulos (GCP-based)
# ===================================
module "networking" {
  source = "./modules/networking"

  project_name  = var.project_name
  environment   = var.environment
  gcp_project_id = var.gcp_project_id
  gcp_region    = var.gcp_region
}

module "security" {
  source = "./modules/security"

  project_name = var.project_name
  environment  = var.environment
  gcp_project_id = var.gcp_project_id
}

module "iam" {
  source = "./modules/iam"

  project_name   = var.project_name
  environment    = var.environment
  gcp_project_id = var.gcp_project_id
}

module "storage" {
  source = "./modules/storage"

  project_name   = var.project_name
  environment    = var.environment
  gcp_project_id = var.gcp_project_id
  gcp_region     = var.gcp_region
}

module "cloud_dns" {
  source = "./modules/cloud_dns"

  project_name   = var.project_name
  gcp_project_id = var.gcp_project_id
}

module "secrets" {
  source = "./modules/secrets"

  project_name   = var.project_name
  environment    = var.environment
  gcp_project_id = var.gcp_project_id
  gcp_region     = var.gcp_region
}

module "cloud_sql" {
  source = "./modules/cloud_sql"

  project_name          = var.project_name
  environment           = var.environment
  gcp_project_id        = var.gcp_project_id
  gcp_region            = var.gcp_region
  network_id            = module.networking.network_id
  db_name               = var.db_name
  db_username           = var.db_username
  db_password           = local.db_password_effective
  db_instance_tier      = var.db_instance_tier
  db_machine_type       = var.db_machine_type
  db_backup_retention   = var.db_backup_retention
  db_deletion_protection = var.db_deletion_protection
  db_availability_type  = var.db_availability_type
}

module "memorystore" {
  source = "./modules/memorystore"

  project_name           = var.project_name
  environment            = var.environment
  gcp_project_id         = var.gcp_project_id
  gcp_region             = var.gcp_region
  network_id             = module.networking.network_id
  redis_tier             = var.redis_tier
  redis_size_gb          = var.redis_size_gb
  redis_memory_size_gb   = var.redis_memory_size_gb
  redis_connect_mode     = var.redis_connect_mode
}

module "cloud_run" {
  source = "./modules/cloud_run"

  project_name          = var.project_name
  environment           = var.environment
  gcp_project_id        = var.gcp_project_id
  gcp_region            = var.gcp_region
  services              = var.cloud_run_services
  image_registry        = var.image_registry
  vpc_connector_id      = module.networking.vpc_connector_id
  service_account_email = module.iam.cloud_run_sa_email
}

module "monitoring" {
  source = "./modules/monitoring"

  project_name   = var.project_name
  environment    = var.environment
  gcp_project_id = var.gcp_project_id
}
