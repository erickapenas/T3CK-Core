terraform {
  required_version = ">= 1.0.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 4.0"
    }
  }
}

provider "google" {
  project = var.project
  region  = var.region
}

# Create a Cloud Run service that runs the backup container
resource "google_cloud_run_service" "backup_service" {
  name     = "firestore-backup-runner"
  location = var.region

  template {
    spec {
      containers {
        image = var.backup_image
        env {
          name  = "S3_BUCKET"
          value = var.s3_bucket
        }
        env {
          name  = "FIRESTORE_EXPORT_PREFIX"
          value = var.firestore_export_prefix
        }
      }
    }
  }

  traffic {
    percent         = 100
    latest_revision = true
  }
}

# Allow unauthenticated invocations if desired (or use IAM to restrict)
resource "google_cloud_run_service_iam_member" "invoker" {
  project        = var.project
  location       = google_cloud_run_service.backup_service.location
  service        = google_cloud_run_service.backup_service.name
  role           = "roles/run.invoker"
  member         = var.invoker_member
}

# Create a Pub/Sub topic for the scheduler to publish to
resource "google_pubsub_topic" "backup_topic" {
  name = "backup-scheduler-topic"
}

# Create a subscription that triggers the Cloud Run service via push
resource "google_pubsub_subscription" "backup_sub" {
  name  = "backup-scheduler-subscription"
  topic = google_pubsub_topic.backup_topic.name

  push_config {
    push_endpoint = "${google_cloud_run_service.backup_service.status[0].url}"
    oidc_token {
      service_account_email = var.run_service_account
    }
  }
}

# Create the Cloud Scheduler job
resource "google_cloud_scheduler_job" "backup_job" {
  name = "firestore-backup-job"
  schedule = var.cron_schedule
  time_zone = var.time_zone

  pubsub_target {
    topic_name = google_pubsub_topic.backup_topic.id
    data = base64encode(jsonencode({ "action" = "backup" }))
  }
}
