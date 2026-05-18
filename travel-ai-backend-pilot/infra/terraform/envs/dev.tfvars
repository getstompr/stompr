environment = "dev"
region      = "us-east-1"

certificate_arn            = "arn:aws:acm:us-east-1:111111111111:certificate/replace-me"
cloudfront_certificate_arn = "arn:aws:acm:us-east-1:111111111111:certificate/replace-me"

domain         = "api-dev.example.com"
hosted_zone_id = "ZXXXXXXXXXXXXX"

desired_count         = 1
enable_autoscaling    = false
backup_retention_days = 7
deletion_protection   = false

aurora_instance_class = "db.t4g.medium"

allowed_origins = [
  "https://www.clienttravel-dev.com",
  "https://staging.clienttravel-dev.com"
]

widget_signing_secret_value = "replace-dev-widget-signing-secret"
widget_admin_key_value      = "replace-dev-widget-admin-key"

model_primary_provider  = "openai"
model_primary_model     = "gpt-4.1"
model_fallback_provider = "anthropic"
model_fallback_model    = "claude-3-5-sonnet-latest"
openai_base_url         = ""
anthropic_base_url      = ""

openai_api_key_value    = "replace-dev-openai-key"
anthropic_api_key_value = "replace-dev-anthropic-key"
