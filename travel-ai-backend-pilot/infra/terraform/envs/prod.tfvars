environment = "prod"
region      = "us-east-1"

certificate_arn            = "arn:aws:acm:us-east-1:111111111111:certificate/replace-me"
cloudfront_certificate_arn = "arn:aws:acm:us-east-1:111111111111:certificate/replace-me"

domain         = "api.example.com"
hosted_zone_id = "ZXXXXXXXXXXXXX"

desired_count         = 1
enable_autoscaling    = false
backup_retention_days = 14
deletion_protection   = true
use_nat_gateway       = false
ecs_assign_public_ip  = true
task_cpu              = 256
task_memory           = 512

aurora_instance_class = "db.t4g.medium"

allowed_origins = [
  "https://www.clienttravel.com",
  "https://staging.clienttravel.com"
]

widget_signing_secret_value = "replace-prod-widget-signing-secret"
widget_admin_key_value      = "replace-prod-widget-admin-key"

model_primary_provider  = "openai"
model_primary_model     = "gpt-4.1"
model_fallback_provider = "anthropic"
model_fallback_model    = "claude-3-5-sonnet-latest"
openai_base_url         = ""
anthropic_base_url      = ""

openai_api_key_value    = "replace-prod-openai-key"
anthropic_api_key_value = "replace-prod-anthropic-key"
