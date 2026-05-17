locals {
  app_name      = "${var.name_prefix}-${var.environment}"
  azs           = slice(data.aws_availability_zones.available.names, 0, 2)
  public_cidrs  = [for i in range(length(local.azs)) : cidrsubnet(var.vpc_cidr, 8, i)]
  private_cidrs = [for i in range(length(local.azs)) : cidrsubnet(var.vpc_cidr, 8, i + 16)]

  tags = merge(
    {
      Project     = var.name_prefix
      Environment = var.environment
      ManagedBy   = "terraform"
      Service     = "travel-ai-platform"
    },
    var.tags,
  )

  cors_allow_origins = length(var.allowed_origins) > 0 ? join(",", var.allowed_origins) : ""
  alarm_actions      = var.alarm_notification_topic_arn != "" ? [var.alarm_notification_topic_arn] : []
  ecs_run_public     = var.ecs_assign_public_ip || !var.use_nat_gateway

  use_custom_domain = var.domain != "" && var.hosted_zone_id != "" && var.cloudfront_certificate_arn != ""
}
