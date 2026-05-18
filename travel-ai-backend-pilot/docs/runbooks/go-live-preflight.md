# Go-Live Preflight Checklist (Pilot / Minimal-Cost)

Use this checklist 24-48 hours before pilot cutover.

## 1) DNS / TLS / Edge
- [ ] ACM certificate is issued and attached to ALB listener (regional cert).
- [ ] CloudFront certificate (us-east-1) is issued for custom domain.
- [ ] Route53 alias record points to CloudFront distribution.
- [ ] External checks succeed:
  - `curl -I https://<api-domain>/health`
  - `curl -I https://<api-domain>/widget/v1.js`

## 2) Terraform and AWS Baseline
- [ ] `terraform plan -var-file=envs/prod.tfvars` is clean/approved.
- [ ] Terraform outputs captured and stored in deployment notes:
  - `api_base_url`
  - `ecs_cluster_name`, `ecs_service_name`, `ecs_task_family`
  - `database_url_secret_arn`, `widget_*_secret_arn`, `openai_api_key_secret_arn`, `anthropic_api_key_secret_arn`
- [ ] CloudWatch alarms are visible in AWS Console and notification action is attached.

## 3) Secrets + Config
- [ ] Real values are set in Secrets Manager (no placeholders).
- [ ] Widget/admin/model keys have been rotated at least once from initial bootstrap values.
- [ ] GitHub prod environment secrets are complete (deploy.yml inputs).
- [ ] `CORS_ALLOW_ORIGINS` is restricted to pilot domains (no `*`).
- [ ] Model routing confirmed:
  - `MODEL_PRIMARY_PROVIDER=openai`
  - `MODEL_FALLBACK_PROVIDER=anthropic`

## 4) App + Data Readiness
- [ ] Seed tenant/domain allow-list reflects pilot agencies.
- [ ] Ingestion sources are configured for each pilot tenant.
- [ ] CRM credentials/permissions validated for handoff task creation.

## 5) Operational Readiness
- [ ] On-call owner and escalation contact confirmed for pilot window.
- [ ] Rollback runbook owner confirmed.
- [ ] Incident triage runbook reviewed for provider outage flow.

## 6) Release Rehearsal
- [ ] Run a full dev rehearsal via CI deploy (build -> deploy -> smoke).
- [ ] Smoke tests pass for:
  - token mint (`/v1/widget/token`)
  - chat session (`/v1/chat/session`)
  - message (`/v1/chat/message`)
  - handoff (`/v1/handoff/escalate`)
- [ ] Validate one rollback drill in dev or prod-like environment.
