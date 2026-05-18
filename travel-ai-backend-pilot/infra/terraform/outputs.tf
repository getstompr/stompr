output "vpc_id" {
  description = "VPC id"
  value       = aws_vpc.this.id
}

output "public_subnet_ids" {
  description = "Public subnet ids"
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "Private subnet ids"
  value       = aws_subnet.private[*].id
}

output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = aws_ecs_cluster.this.name
}

output "ecs_service_name" {
  description = "ECS service name"
  value       = aws_ecs_service.app.name
}

output "ecs_task_family" {
  description = "ECS task definition family"
  value       = aws_ecs_task_definition.app.family
}

output "ecr_repository_url" {
  description = "ECR repository URL"
  value       = aws_ecr_repository.app.repository_url
}

output "alb_dns_name" {
  description = "ALB DNS name"
  value       = aws_lb.app.dns_name
}

output "cloudfront_domain_name" {
  description = "CloudFront distribution domain"
  value       = aws_cloudfront_distribution.app.domain_name
}

output "api_base_url" {
  description = "API base URL"
  value       = local.use_custom_domain ? "https://${var.domain}" : "https://${aws_cloudfront_distribution.app.domain_name}"
}

output "database_url_secret_arn" {
  description = "Secrets Manager ARN for DATABASE_URL"
  value       = aws_secretsmanager_secret.database_url.arn
}

output "widget_signing_secret_arn" {
  description = "Secrets Manager ARN for WIDGET_SIGNING_SECRET"
  value       = aws_secretsmanager_secret.widget_signing.arn
}

output "widget_admin_key_secret_arn" {
  description = "Secrets Manager ARN for WIDGET_ADMIN_KEY"
  value       = aws_secretsmanager_secret.widget_admin_key.arn
}

output "openai_api_key_secret_arn" {
  description = "Secrets Manager ARN for OPENAI_API_KEY"
  value       = aws_secretsmanager_secret.openai_api_key.arn
}

output "anthropic_api_key_secret_arn" {
  description = "Secrets Manager ARN for ANTHROPIC_API_KEY"
  value       = aws_secretsmanager_secret.anthropic_api_key.arn
}

output "aurora_writer_endpoint" {
  description = "Aurora writer endpoint"
  value       = aws_rds_cluster.aurora.endpoint
}

output "ingest_bucket_name" {
  description = "S3 bucket for ingestion artifacts"
  value       = aws_s3_bucket.ingest_artifacts.id
}

output "exports_bucket_name" {
  description = "S3 bucket for exports"
  value       = aws_s3_bucket.exports.id
}
