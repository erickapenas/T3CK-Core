# AWS WAF for DDoS/web attack protection
# Protects ALB against SQL injection, XSS, and rate-based attacks

# WAF WebACL for ALB
resource "aws_wafv2_web_acl" "main" {
  name  = "t3ck-waf-${var.environment}"
  scope = "REGIONAL"

  default_action {
    allow {}
  }

  # Rule 1: AWS Managed Rules - Common Rule Set (CRS)
  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = 1

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"

        # Exclude specific rules that cause false positives
        rule_action_override {
          action_to_use {
            count {}
          }
          name = "SizeRestrictions_BODY"
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "AWSManagedRulesCommonRuleSetMetric"
      sampled_requests_enabled   = true
    }
  }

  # Rule 2: Known Bad Inputs Rule Set
  rule {
    name     = "AWSManagedRulesKnownBadInputsRuleSet"
    priority = 2

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "AWSManagedRulesKnownBadInputsRuleSetMetric"
      sampled_requests_enabled   = true
    }
  }

  # Rule 3: SQL Injection Protection
  rule {
    name     = "AWSManagedRulesSQLiRuleSet"
    priority = 3

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesSQLiRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "AWSManagedRulesSQLiRuleSetMetric"
      sampled_requests_enabled   = true
    }
  }

  # Rule 4: Geographic Restriction (if enabled)
  dynamic "rule" {
    for_each = var.enable_geo_blocking ? [1] : []
    content {
      name     = "GeoBlockingRule"
      priority = 4

      action {
        block {}
      }

      statement {
        geo_match_statement {
          country_codes = var.blocked_countries
        }
      }

      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name                = "GeoBlockingRuleMetric"
        sampled_requests_enabled   = true
      }
    }
  }

  # Rule 5: Rate Limiting
  rule {
    name     = "RateLimitRule"
    priority = var.enable_geo_blocking ? 5 : 4

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit              = var.rate_limit_threshold
        aggregate_key_type = "IP"

        # Scope down by URI path patterns
        scope_down_statement {
          byte_match_statement {
            field_to_match {
              uri_path {}
            }
            text_transformation {
              priority = 0
              type     = "URL_DECODE"
            }
            positional_constraint = "STARTS_WITH"
            search_string         = "/api"
          }
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "RateLimitRuleMetric"
      sampled_requests_enabled   = true
    }
  }

  # Rule 6: Custom Rule - Require API Key Header
  rule {
    name     = "APIKeyHeader"
    priority = var.enable_geo_blocking ? 6 : 5

    action {
      block {
        custom_response {
          response_code = 403
          custom_response_body_key = "api_key_missing"
        }
      }
    }

    statement {
      byte_match_statement {
        field_to_match {
          uri_path {}
        }
        text_transformation {
          priority = 0
          type     = "LOWERCASE"
        }
        positional_constraint = "STARTS_WITH"
        search_string         = "/api"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "APIKeyHeaderMetric"
      sampled_requests_enabled   = true
    }
  }

  # Rule 7: IP Reputation List (Threat Intel)
  rule {
    name     = "AWSManagedRulesAmazonIpReputationList"
    priority = var.enable_geo_blocking ? 7 : 6

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesAmazonIpReputationList"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "AWSManagedRulesAmazonIpReputationListMetric"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "t3ck-waf-${var.environment}"
    sampled_requests_enabled   = true
  }

  tags = {
    Name        = "t3ck-waf-${var.environment}"
    Environment = var.environment
  }
}

# Custom response body for blocked requests
resource "aws_wafv2_web_acl" "main" {
  custom_response_body {
    key          = "api_key_missing"
    content      = "API key required"
    content_type = "TEXT_PLAIN"
  }
}

# Associate WAF with ALB
resource "aws_wafv2_web_acl_association" "alb" {
  resource_arn = var.alb_arn
  web_acl_arn  = aws_wafv2_web_acl.main.arn
}

# CloudWatch group for WAF logs
resource "aws_cloudwatch_log_group" "waf_logs" {
  name              = "/aws/waf/${var.environment}"
  retention_in_days = 30

  tags = {
    Environment = var.environment
  }
}

# Enable WAF logging
resource "aws_wafv2_web_acl_logging_configuration" "main" {
  resource_arn            = aws_wafv2_web_acl.main.arn
  log_destination_configs = [aws_cloudwatch_log_group.waf_logs.arn]

  logging_filter {
    default_behavior = "KEEP"

    filter {
      behavior = "KEEP"
      condition {
        action_condition {
          action = "BLOCK"
        }
      }
      requirement = "MEETS_ANY"
    }
  }
}

# IP Set for manual blocklist
resource "aws_wafv2_ip_set" "blacklist" {
  name               = "t3ck-blacklist-${var.environment}"
  scope              = "REGIONAL"
  ip_address_version = "IPV4"
  addresses          = var.blocked_ips

  tags = {
    Environment = var.environment
  }
}

# Blocklist rule (if blacklist is provided)
resource "aws_wafv2_web_acl" "main" {
  rule {
    name     = "BlacklistIPs"
    priority = 0

    action {
      block {}
    }

    statement {
      ip_set_reference_statement {
        arn = aws_wafv2_ip_set.blacklist.arn
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "BlacklistIPsMetric"
      sampled_requests_enabled   = true
    }
  }
}
