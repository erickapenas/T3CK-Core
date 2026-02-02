output "cloud_run_url" {
  value = google_cloud_run_service.backup_service.status[0].url
}

output "scheduler_job_name" {
  value = google_cloud_scheduler_job.backup_job.name
}
