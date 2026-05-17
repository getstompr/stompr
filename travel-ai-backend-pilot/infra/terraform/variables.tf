variable "name_prefix" {
  description = "Project/application name prefix."
  type        = string
  default     = "travel-ai"
}

variable "environment" {
  description = "Deployment environment (dev|prod)."
  type        = string
}

variable "region" {
  description = "AWS region for deployment."
  type        = string
  default     = "us-east-1"
}

variable "vpc_cidr" {
  description = "CIDR block for VPC."
  type        = string
  default     = "10.40.0.0/16"
}

variable "certificate_arn" {
  description = "ACM certificate ARN for ALB HTTPS listener (regional cert)."
  type        = string
}

variable "cloudfront_certificate_arn" {
  description = "Optional ACM certificate ARN in us-east-1 for CloudFront custom domain."
  type        = string
  default     = ""
}

variable "domain" {
  description = "Optional API custom domain (e.g. api.example.com). Leave blank to use CloudFront default domain."
  type        = string
  default     = ""
}

variable "hosted_zone_id" {
  description = "Optional Route53 hosted zone id for the custom domain alias record."
  type        = string
  default     = ""
}

variable "container_port" {
  description = "Application container port."
  type        = number
  default     = 3000
}

variable "task_cpu" {
  description = "Fargate task CPU units."
  type        = number
  default     = 512
}

variable "task_memory" {
  description = "Fargate task memory in MiB."
  type        = number
  default     = 1024
}

variable "desired_count" {
  description = "Desired ECS service task count."
  type        = number
  default     = 1
}

variable "enable_autoscaling" {
  description = "Enable ECS autoscaling policies."
  type        = bool
  default     = false
}

variable "min_capacity" {
  description = "Minimum ECS desired tasks when autoscaling is enabled."
  type        = number
  default     = 1
}

variable "max_capacity" {
  description = "Maximum ECS desired tasks when autoscaling is enabled."
  type        = number
  default     = 3
}

variable "use_nat_gateway" {
  description = "Create NAT Gateway for private subnet egress. Disable for low-cost demo mode when ECS runs in public subnets."
  type        = bool
  default     = true
}

variable "ecs_assign_public_ip" {
  description = "Assign public IPs to ECS tasks. Useful for low-cost demo mode when NAT is disabled."
  type        = bool
  default     = false

  validation {
    condition     = var.use_nat_gateway || var.ecs_assign_public_ip
    error_message = "When use_nat_gateway is false, ecs_assign_public_ip must be true so ECS tasks have egress connectivity."
  }
}

variable "image_tag" {
  description = "Initial image tag to deploy. CI/CD updates task definitions with newer tags."
  type        = string
  default     = "latest"
}

variable "aurora_instance_class" {
  description = "Aurora PostgreSQL instance class."
  type        = string
  default     = "db.t4g.medium"
}

variable "aurora_engine_version" {
  description = "Aurora PostgreSQL engine version."
  type        = string
  default     = "16.3"
}

variable "backup_retention_days" {
  description = "Backup retention days for Aurora cluster."
  type        = number
  default     = 14
}

variable "deletion_protection" {
  description = "Enable deletion protection for Aurora cluster."
  type        = bool
  default     = true
}

variable "db_name" {
  description = "Default database name."
  type        = string
  default     = "travel_ai"
}

variable "db_master_username" {
  description = "Aurora master username."
  type        = string
  default     = "travel_admin"
}

variable "allowed_origins" {
  description = "CORS allowed origins for widget/API browser requests."
  type        = list(string)
  default     = []
}

variable "widget_signing_secret_value" {
  description = "Initial widget signing secret value. Rotate after first deploy."
  type        = string
  sensitive   = true
}

variable "widget_admin_key_value" {
  description = "Initial widget admin key value used to mint signed tokens. Rotate after first deploy."
  type        = string
  sensitive   = true
}

variable "model_primary_provider" {
  description = "Primary model provider (openai|anthropic|mock)."
  type        = string
  default     = "mock"
}

variable "model_primary_model" {
  description = "Primary provider model id."
  type        = string
  default     = ""
}

variable "model_fallback_provider" {
  description = "Fallback model provider (openai|anthropic|mock)."
  type        = string
  default     = "mock"
}

variable "model_fallback_model" {
  description = "Fallback provider model id."
  type        = string
  default     = ""
}

variable "openai_base_url" {
  description = "Optional OpenAI-compatible base URL."
  type        = string
  default     = ""
}

variable "anthropic_base_url" {
  description = "Optional Anthropic-compatible base URL."
  type        = string
  default     = ""
}

variable "openai_api_key_value" {
  description = "OpenAI API key secret value (can be blank if OpenAI is not used)."
  type        = string
  sensitive   = true
  default     = ""
}

variable "anthropic_api_key_value" {
  description = "Anthropic API key secret value (can be blank if Anthropic is not used)."
  type        = string
  sensitive   = true
  default     = ""
}

variable "rate_limit_enabled" {
  description = "Enable in-app API rate limiting middleware."
  type        = bool
  default     = false
}

variable "rate_limit_window_ms" {
  description = "Rate limit window size in milliseconds."
  type        = number
  default     = 60000
}

variable "rate_limit_max_requests" {
  description = "Maximum requests per IP+path within the window."
  type        = number
  default     = 120
}

variable "rate_limit_exclude_path_prefixes" {
  description = "Comma-separated path prefixes to skip rate limiting."
  type        = string
  default     = "/health,/widget/v1.js"
}

variable "gate_router_classifier_enabled" {
  description = "Enable stage-B lightweight model classifier for gate routing."
  type        = bool
  default     = false
}

variable "gate_router_classifier_provider" {
  description = "Provider for stage-B gate classifier (openai|anthropic)."
  type        = string
  default     = "openai"
}

variable "gate_router_classifier_model" {
  description = "Model name for stage-B gate classifier."
  type        = string
  default     = "gpt-4.1-mini"
}

variable "db_password_length" {
  description = "Generated master password length."
  type        = number
  default     = 32
}

variable "alarm_notification_topic_arn" {
  description = "Optional SNS topic ARN for CloudWatch alarm notifications."
  type        = string
  default     = ""
}

variable "enable_waf" {
  description = "Enable AWS WAF v2 on the public ALB."
  type        = bool
  default     = false
}

variable "waf_rate_limit" {
  description = "Per-IP request rate limit (5-minute window) for AWS WAF rate-based rule."
  type        = number
  default     = 1200
}

variable "tags" {
  description = "Extra tags applied to all resources."
  type        = map(string)
  default     = {}
}
