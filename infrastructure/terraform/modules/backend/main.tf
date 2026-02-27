# Terraform Remote State Backend
# Stores state in S3 with DynamoDB locking for multi-developer safety

# S3 bucket for Terraform state
resource "aws_s3_bucket" "terraform_state" {
  bucket = var.state_bucket_name

  tags = {
    Name        = "terraform-state-${var.environment}"
    Purpose     = "Terraform Remote State"
    Environment = var.environment
  }
}

# Enable versioning for state file rollback
resource "aws_s3_bucket_versioning" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  versioning_configuration {
    status     = "Enabled"
    mfa_delete = "Disabled"
  }
}

# Block all public access
resource "aws_s3_bucket_public_access_block" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Enforce server-side encryption for state files
resource "aws_s3_bucket_server_side_encryption_configuration" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.terraform_state.arn
    }
  }
}

# Enforce SSL/TLS for bucket access
resource "aws_s3_bucket_policy" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "DenyUnencryptedObjectUploads"
        Effect = "Deny"
        Principal = "*"
        Action = "s3:PutObject"
        Resource = "${aws_s3_bucket.terraform_state.arn}/*"
        Condition = {
          StringNotEquals = {
            "s3:x-amz-server-side-encryption" = "aws:kms"
          }
        }
      },
      {
        Sid    = "DenyInsecureTransport"
        Effect = "Deny"
        Principal = "*"
        Action = "s3:*"
        Resource = [
          aws_s3_bucket.terraform_state.arn,
          "${aws_s3_bucket.terraform_state.arn}/*"
        ]
        Condition = {
          Bool = {
            "aws:SecureTransport" = "false"
          }
        }
      },
      {
        Sid    = "DenyIncorrectKMSKey"
        Effect = "Deny"
        Principal = "*"
        Action = "s3:PutObject"
        Resource = "${aws_s3_bucket.terraform_state.arn}/*"
        Condition = {
          StringNotEquals = {
            "s3:x-amz-server-side-encryption-aws-kms-key-id" = aws_kms_key.terraform_state.arn
          }
        }
      }
    ]
  })
}

# Enable logging for state bucket (audit trail)
resource "aws_s3_bucket_logging" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  target_bucket = aws_s3_bucket.terraform_logs.id
  target_prefix = "terraform-state-logs/"
}

# S3 bucket for storing access logs
resource "aws_s3_bucket" "terraform_logs" {
  bucket = var.logs_bucket_name

  tags = {
    Name        = "terraform-logs-${var.environment}"
    Purpose     = "Terraform State Logging"
    Environment = var.environment
  }
}

# Block public access to logs bucket
resource "aws_s3_bucket_public_access_block" "terraform_logs" {
  bucket = aws_s3_bucket.terraform_logs.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Set lifecycle policy for logs (keep 90 days)
resource "aws_s3_bucket_lifecycle_configuration" "terraform_logs" {
  bucket = aws_s3_bucket.terraform_logs.id

  rule {
    id     = "delete-logs-after-90-days"
    status = "Enabled"

    expiration {
      days = 90
    }
  }
}

# KMS key for S3 encryption
resource "aws_kms_key" "terraform_state" {
  description             = "KMS key for Terraform state encryption"
  deletion_window_in_days = 10
  enable_key_rotation     = true

  tags = {
    Name        = "terraform-state-key-${var.environment}"
    Environment = var.environment
  }
}

resource "aws_kms_alias" "terraform_state" {
  name          = "alias/terraform-state-${var.environment}"
  target_key_id = aws_kms_key.terraform_state.key_id
}

# DynamoDB table for Terraform state locking
resource "aws_dynamodb_table" "terraform_locks" {
  name           = var.locks_table_name
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled     = true
    kms_key_arn = aws_kms_key.terraform_state.arn
  }

  ttl {
    attribute_name = "ExpireTime"
    enabled        = true
  }

  tags = {
    Name        = "terraform-locks-${var.environment}"
    Purpose     = "Terraform State Locking"
    Environment = var.environment
  }
}

# CloudWatch log group for monitoring backend access
resource "aws_cloudwatch_log_group" "terraform_state_logs" {
  name              = "/aws/terraform/state-${var.environment}"
  retention_in_days = 30

  tags = {
    Environment = var.environment
  }
}
