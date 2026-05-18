# AWS Infrastructure (Terraform)

This Terraform stack provisions AWS infrastructure for the Travel AI platform using:
- ECS on Fargate
- Aurora PostgreSQL + pgvector migration support
- ALB + CloudFront
- Secrets Manager
- S3 buckets for ingestion/export artifacts
- CloudWatch alarms/dashboard

## Preconditions
- Terraform >= 1.6
- AWS account with permissions for VPC, ECS, ECR, RDS, CloudFront, ACM, Route53, IAM, CloudWatch, S3, Secrets Manager
- ACM cert in target region for ALB (`certificate_arn`)
- ACM cert in us-east-1 for CloudFront custom domain (`cloudfront_certificate_arn`) when using custom domain

## State backend
Copy and edit one of:
- `backend.dev.hcl.example`
- `backend.prod.hcl.example`

Use a real S3 bucket + DynamoDB lock table.

## Deploy dev
```bash
cd infra/terraform
terraform init -backend-config=backend.dev.hcl.example
terraform plan -var-file=envs/dev.tfvars
terraform apply -var-file=envs/dev.tfvars
```

## Deploy prod
```bash
cd infra/terraform
terraform init -backend-config=backend.prod.hcl.example
terraform plan -var-file=envs/prod.tfvars
terraform apply -var-file=envs/prod.tfvars
```

## Notes
- ALB and Aurora subnet group require at least two AZ subnets; this stack keeps runtime minimal by using one ECS task and one Aurora writer instance.
- App migration is executed by CI using one-off ECS task (`node dist/db/migrate.js`).
- Rotate `WIDGET_SIGNING_SECRET` and `WIDGET_ADMIN_KEY` after first deployment.
- The stack now creates Secrets Manager entries for `OPENAI_API_KEY` and `ANTHROPIC_API_KEY`, plus ECS env wiring for `MODEL_PRIMARY_*` / `MODEL_FALLBACK_*`.

## Low-cost production mode
For initial paid pilots/demos, you can run the same architecture with lower baseline cost by setting:
- `use_nat_gateway=false`
- `ecs_assign_public_ip=true`
- `task_cpu=256`
- `task_memory=512`
- `desired_count=1`

Scale-up later is simple:
1. set `use_nat_gateway=true`
2. set `ecs_assign_public_ip=false`
3. increase task sizing and desired count
4. optionally enable autoscaling

## WAF and rate-limiting guidance (recommended for pilot)
Optional WAF is now supported directly in this stack at the ALB layer.

Terraform vars:
- `enable_waf` (`false` default)
- `waf_rate_limit` (requests/5 minutes/IP, default `1200`)

When `enable_waf=true`, Terraform creates:
- AWS WAFv2 Web ACL (regional)
- AWS managed common rule set (`AWSManagedRulesCommonRuleSet`)
- IP rate-based blocking rule
- Web ACL association on the public ALB

Recommended pilot tuning:
1. Start with `waf_rate_limit=1000` to `1500`.
2. Review sampled requests + CloudWatch WAF metrics daily in pilot week.
3. Tighten threshold only after observing real agency traffic patterns.

Application-level optional rate-limiting middleware is also available via ECS env vars:
- `RATE_LIMIT_ENABLED` (`true|false`, default `false`)
- `RATE_LIMIT_WINDOW_MS` (default `60000`)
- `RATE_LIMIT_MAX_REQUESTS` (default `120`)
- `RATE_LIMIT_EXCLUDE_PATH_PREFIXES` (default `/health,/widget/v1.js`)

Hybrid gate-router classifier controls are also exposed via ECS env vars:
- `GATE_ROUTER_CLASSIFIER_ENABLED` (`true|false`, default `false`)
- `GATE_ROUTER_CLASSIFIER_PROVIDER` (`openai|anthropic`, default `openai`)
- `GATE_ROUTER_CLASSIFIER_MODEL` (default `gpt-4.1-mini`)

Alarm notification controls:
- `alarm_notification_topic_arn` (optional SNS topic ARN). If set, CloudWatch alarms send `alarm_actions` and `ok_actions` to this topic.

Aurora durability defaults:
- `deletion_protection=true`
- `backup_retention_days=14`
