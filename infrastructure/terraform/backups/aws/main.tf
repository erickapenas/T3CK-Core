terraform {
  required_version = ">= 1.0.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.0"
    }
  }
}

provider "aws" {
  region = var.region
}

# IAM role for Fargate task to allow S3 put
resource "aws_iam_role" "fargate_task_role" {
  name = "t3ck-backup-task-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Action = "sts:AssumeRole",
        Effect = "Allow",
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_policy" "s3_put_policy" {
  name = "t3ck-backup-s3-put"

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect = "Allow",
        Action = [
          "s3:PutObject",
          "s3:PutObjectAcl",
          "s3:ListBucket"
        ],
        Resource = [
          "arn:aws:s3:::${var.s3_bucket}",
          "arn:aws:s3:::${var.s3_bucket}/*"
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "attach_policy" {
  role       = aws_iam_role.fargate_task_role.name
  policy_arn = aws_iam_policy.s3_put_policy.arn
}

# ECS task definition
resource "aws_ecs_task_definition" "backup_task" {
  family                   = "t3ck-backup-task"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.cpu
  memory                   = var.memory
  execution_role_arn       = var.execution_role_arn
  task_role_arn            = aws_iam_role.fargate_task_role.arn

  container_definitions = jsonencode([
    {
      name      = "backup-runner",
      image     = var.backup_image,
      essential = true,
      environment = [
        { name = "S3_BUCKET", value = var.s3_bucket }
      ]
    }
  ])
}

# ECS cluster (if not existing)
resource "aws_ecs_cluster" "backup_cluster" {
  name = "t3ck-backup-cluster"
}

# CloudWatch EventBridge rule for schedule
resource "aws_cloudwatch_event_rule" "backup_schedule" {
  name                = "t3ck-backup-schedule"
  schedule_expression = var.schedule_expression
}

# Permission to allow EventBridge to run tasks
resource "aws_iam_role" "event_role" {
  name = "t3ck-eventbridge-invoke-ecs"

  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect = "Allow",
        Principal = { Service = "events.amazonaws.com" },
        Action = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_cloudwatch_event_target" "run_backup_task" {
  rule      = aws_cloudwatch_event_rule.backup_schedule.name
  arn       = aws_ecs_cluster.backup_cluster.arn
  role_arn  = aws_iam_role.event_role.arn

  ecs_target {
    task_definition_arn = aws_ecs_task_definition.backup_task.arn
    launch_type         = "FARGATE"
    network_configuration {
      subnets         = var.subnets
      security_groups = var.security_groups
      assign_public_ip = var.assign_public_ip
    }
  }
}
