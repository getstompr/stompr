# Travel AI Platform MVP

Services-led, hybrid-pod architecture for luxury travel agency lead conversion + RAG-powered advisor handoff.

## What is implemented
- Shared control plane primitives: tenant registry, ingest source registry, analytics funnel, audit log.
- Per-tenant isolation model: tenant-scoped sessions, leads, docs, handoffs, retrieval.
- Storage abstraction with two backends: `memory` and `postgres` + `pgvector`.
- Ingestion + RAG pipeline: source registration, connector ingestion stub, chunking, PII redaction, metadata enrichment.
- Vector candidate retrieval in Postgres using `embedding <=> query_vector`, then policy + advantage-aware ranking in app layer.
- Travel advantage graph: supplier <-> destination <-> trip type strength modeling used in retrieval boosting.
- Conversation orchestration: qualification scoring, CTA generation, guardrails, live handoff, CRM task creation.
- CRM adapter interface + starter adapters: HubSpot, Salesforce, Pipedrive.
- Deployable hosted widget script: `GET /widget/v1.js`.
- Signed widget token flow:
  - `POST /v1/widget/token` (admin-key protected minting)
  - token validation on `POST /v1/chat/session`
  - token validation on `POST /v1/widget/event`
- AWS V1 infrastructure as code (Terraform) for ECS Fargate + Aurora Postgres + ALB + CloudFront.

## API surface
- `POST /v1/chat/session`
- `POST /v1/chat/message`
- `POST /v1/lead/qualify`
- `POST /v1/handoff/escalate`
- `POST /v1/ingest/source`
- `POST /v1/ingest/run`
- `GET /v1/analytics/funnel`
- `GET /v1/audit`
- `GET /widget/v1.js`
- `POST /v1/widget/event`
- `POST /v1/widget/token`

## Local run (memory backend)
```bash
npm install
npm run dev
```

## Local run (Postgres)
```bash
# PowerShell
$env:STORAGE_BACKEND="postgres"
$env:DATABASE_URL="postgres://user:pass@localhost:5432/travel_ai"
$env:PG_SSL="false"
npm run db:migrate
npm run dev
```

## Model provider configuration (OpenAI + Claude)
Provider routing is environment-driven. If keys are missing or provider config is invalid, the app safely falls back to the built-in mock model providers.

Core variables:
- `MODEL_PRIMARY_PROVIDER` = `openai` | `anthropic` | `mock`
- `MODEL_PRIMARY_MODEL` = model id for primary provider
- `MODEL_FALLBACK_PROVIDER` = `openai` | `anthropic` | `mock`
- `MODEL_FALLBACK_MODEL` = model id for fallback provider

Provider credentials:
- `OPENAI_API_KEY` (required when either provider is `openai`)
- `OPENAI_BASE_URL` (optional)
- `ANTHROPIC_API_KEY` (required when either provider is `anthropic`)
- `ANTHROPIC_BASE_URL` (optional)

RAG embedding provider settings:
- `EMBEDDING_MODEL` (optional, default `text-embedding-3-small`)
- `EMBEDDING_DIMENSIONS` (optional, default `64`; must match DB `VECTOR(64)` unless schema is updated)

Notes:
- When `OPENAI_API_KEY` is present, embeddings are generated via OpenAI for production-grade semantic retrieval.
- If embedding provider calls fail or key is missing, the app falls back to deterministic local embeddings to keep dev/test workflows running.

Example (OpenAI primary, Claude fallback):
```bash
# PowerShell
$env:MODEL_PRIMARY_PROVIDER="openai"
$env:MODEL_PRIMARY_MODEL="gpt-4.1"
$env:MODEL_FALLBACK_PROVIDER="anthropic"
$env:MODEL_FALLBACK_MODEL="claude-3-5-sonnet-latest"
$env:OPENAI_API_KEY="<openai_key>"
$env:ANTHROPIC_API_KEY="<anthropic_key>"
```

## Optional API rate-limiting middleware
The API now supports an optional in-app rate-limit hook (disabled by default).

Environment variables:
- `RATE_LIMIT_ENABLED` (`true|false`, default `false`)
- `RATE_LIMIT_WINDOW_MS` (default `60000`)
- `RATE_LIMIT_MAX_REQUESTS` (default `120`)
- `RATE_LIMIT_EXCLUDE_PATH_PREFIXES` (comma-separated, default `/health,/widget/v1.js`)

## Gate router (hybrid prompting)
The chatbot now routes each turn through a hybrid gate router before generation:
- Stage A: hard rules (`explicit agent request`, `safety booking language`, `missing core slots`)
- Stage B: optional lightweight model classifier for ambiguous routing
- Low-confidence fallback: `qualification`

Router output shape:
- `{ gate, confidence, missing_slots, escalation_signal, override_reason }`

Optional environment variables:
- `GATE_ROUTER_CLASSIFIER_ENABLED` (`true|false`, default `false`)
- `GATE_ROUTER_CLASSIFIER_PROVIDER` (`openai|anthropic`, default `openai`)
- `GATE_ROUTER_CLASSIFIER_MODEL` (default `gpt-4.1-mini`)

## AWS deployment (Terraform)
Infrastructure files are under `infra/terraform`.

```bash
cd infra/terraform
terraform init -backend-config=backend.dev.hcl.example
terraform plan -var-file=envs/dev.tfvars
terraform apply -var-file=envs/dev.tfvars
```

For prod use `backend.prod.hcl.example` and `envs/prod.tfvars`.

### Low-cost production profile (current `prod.tfvars`)
The current production tfvars are configured for a cost-conscious pilot/demo baseline:
- `use_nat_gateway=false`
- `ecs_assign_public_ip=true`
- `task_cpu=256`
- `task_memory=512`
- `desired_count=1`

This keeps Aurora + ECS + ALB + CloudFront intact while reducing baseline spend.

If you also shut down off-hours: often ~$40–90/mo

Scale-up to fuller production is a simple variable flip:
1. set `use_nat_gateway=true`
2. set `ecs_assign_public_ip=false`
3. increase `task_cpu`/`task_memory`
4. optionally enable autoscaling (`enable_autoscaling=true`)

Provisioned components include:
- VPC, public/private subnets, NAT
- ALB (TLS), target group (`/health` check), ECS service in private subnets
- CloudFront with cache rules:
  - `/widget/*` long TTL
  - `/v1/*` no cache
- Aurora PostgreSQL writer instance + pgvector-capable schema migration path
- Secrets Manager entries for `DATABASE_URL`, `WIDGET_SIGNING_SECRET`, `WIDGET_ADMIN_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`
- S3 buckets for ingestion/export artifacts
- CloudWatch alarms and dashboard
- Optional ALB WAFv2 (`enable_waf=true`) with managed common rules + IP rate-based rule

Operational Terraform knobs:
- `alarm_notification_topic_arn` (optional SNS topic for alarm/ok notifications)
- `enable_waf` (default `false`)
- `waf_rate_limit` (default `1200` req/5 min/IP)
- `deletion_protection` (default `true`)
- `backup_retention_days` (default `14`)

## CI/CD (GitHub Actions)
Workflows:
- `.github/workflows/ci.yml`
- `.github/workflows/deploy.yml`
- `.github/workflows/terraform-plan.yml`

Deployment workflow stages:
1. lint/test/build
2. Docker build + push to ECR
3. go-live config validation (required env/secrets)
4. register ECS task definition
5. run one-off migration task (`node dist/db/migrate.js`)
6. update ECS service + wait stable
7. smoke test (`/health`, `/widget/v1.js`, `/v1/widget/token`, `/v1/chat/session`, `/v1/chat/message`, `/v1/handoff/escalate`)

### Required GitHub secrets
Global:
- `AWS_REGION`

Dev deploy:
- `DEV_AWS_ROLE_ARN`
- `DEV_ECR_REPOSITORY`
- `DEV_ECS_CLUSTER`
- `DEV_ECS_SERVICE`
- `DEV_ECS_TASK_FAMILY`
- `DEV_ECS_EXECUTION_ROLE_ARN`
- `DEV_ECS_TASK_ROLE_ARN`
- `DEV_DATABASE_URL_SECRET_ARN`
- `DEV_WIDGET_SIGNING_SECRET_ARN`
- `DEV_WIDGET_ADMIN_SECRET_ARN`
- `DEV_OPENAI_API_KEY_SECRET_ARN`
- `DEV_ANTHROPIC_API_KEY_SECRET_ARN`
- `DEV_CORS_ALLOW_ORIGINS`
- `DEV_MODEL_PRIMARY_PROVIDER`
- `DEV_MODEL_PRIMARY_MODEL`
- `DEV_MODEL_FALLBACK_PROVIDER`
- `DEV_MODEL_FALLBACK_MODEL`
- `DEV_OPENAI_BASE_URL` (optional)
- `DEV_ANTHROPIC_BASE_URL` (optional)
- `DEV_LOG_GROUP`
- `DEV_PRIVATE_SUBNETS` (comma-separated)
- `DEV_ECS_SECURITY_GROUP`
- `DEV_BASE_URL`
- `DEV_SMOKE_TENANT_ID` (optional, defaults to `tenant_luxe_demo`)
- `DEV_SMOKE_SITE_ID` (optional, defaults to `luxevoyages.example`)
- `DEV_RATE_LIMIT_ENABLED` (optional override)
- `DEV_RATE_LIMIT_WINDOW_MS` (optional override)
- `DEV_RATE_LIMIT_MAX_REQUESTS` (optional override)
- `DEV_RATE_LIMIT_EXCLUDE_PATH_PREFIXES` (optional override)
- `DEV_GATE_ROUTER_CLASSIFIER_ENABLED` (optional override)
- `DEV_GATE_ROUTER_CLASSIFIER_PROVIDER` (optional override)
- `DEV_GATE_ROUTER_CLASSIFIER_MODEL` (optional override)
- `DEV_WIDGET_SIGNING_SECRET_VALUE` (for terraform-plan)
- `DEV_WIDGET_ADMIN_KEY_VALUE` (for terraform-plan)

Prod deploy:
- `PROD_AWS_ROLE_ARN`
- `PROD_ECR_REPOSITORY`
- `PROD_ECS_CLUSTER`
- `PROD_ECS_SERVICE`
- `PROD_ECS_TASK_FAMILY`
- `PROD_ECS_EXECUTION_ROLE_ARN`
- `PROD_ECS_TASK_ROLE_ARN`
- `PROD_DATABASE_URL_SECRET_ARN`
- `PROD_WIDGET_SIGNING_SECRET_ARN`
- `PROD_WIDGET_ADMIN_SECRET_ARN`
- `PROD_OPENAI_API_KEY_SECRET_ARN`
- `PROD_ANTHROPIC_API_KEY_SECRET_ARN`
- `PROD_CORS_ALLOW_ORIGINS`
- `PROD_MODEL_PRIMARY_PROVIDER`
- `PROD_MODEL_PRIMARY_MODEL`
- `PROD_MODEL_FALLBACK_PROVIDER`
- `PROD_MODEL_FALLBACK_MODEL`
- `PROD_OPENAI_BASE_URL` (optional)
- `PROD_ANTHROPIC_BASE_URL` (optional)
- `PROD_LOG_GROUP`
- `PROD_PRIVATE_SUBNETS` (comma-separated)
- `PROD_ECS_SECURITY_GROUP`
- `PROD_BASE_URL`
- `PROD_SMOKE_TENANT_ID` (optional, defaults to `tenant_luxe_demo`)
- `PROD_SMOKE_SITE_ID` (optional, defaults to `luxevoyages.example`)
- `PROD_RATE_LIMIT_ENABLED` (optional override)
- `PROD_RATE_LIMIT_WINDOW_MS` (optional override)
- `PROD_RATE_LIMIT_MAX_REQUESTS` (optional override)
- `PROD_RATE_LIMIT_EXCLUDE_PATH_PREFIXES` (optional override)
- `PROD_GATE_ROUTER_CLASSIFIER_ENABLED` (optional override)
- `PROD_GATE_ROUTER_CLASSIFIER_PROVIDER` (optional override)
- `PROD_GATE_ROUTER_CLASSIFIER_MODEL` (optional override)

## Secure widget deployment
1. Mint signed token from server-side integration:
```bash
curl -X POST https://<api-domain>/v1/widget/token \
  -H "content-type: application/json" \
  -H "x-widget-admin-key: <admin-key>" \
  -d '{"tenantId":"tenant_luxe_demo","siteId":"www.clienttravel.com","ttlSeconds":3600}'
```

2. Embed widget:
```html
<script
  src="https://<api-domain>/widget/v1.js"
  data-tenant-id="tenant_luxe_demo"
  data-site-id="www.clienttravel.com"
  data-widget-token="<SIGNED_TOKEN>"
  data-brand-name="Client Travel Concierge"
  data-accent="#0b3b8f"
  defer
></script>
```

## Runbooks
- `docs/runbooks/go-live-preflight.md`
- `docs/runbooks/cutover-day-commands.md`
- `docs/runbooks/rollback.md`
- `docs/runbooks/db-restore.md`
- `docs/runbooks/widget-key-rotation.md`
- `docs/runbooks/model-provider-incident.md`

## Go-Live Ops References
- `docs/deploy/prod-deploy-gate-checklist.md`
- `docs/ops/pilot-observability.md`
- `docs/qa/pilot-journeys.md`
- `tests/gateRouter.test.ts` (misroute eval set)

## Pilot journey QA pack
Scripted, repeatable QA journeys (honeymoon/family/flexible) can run against any deployed environment.

```bash
# Linux/macOS
export API_BASE_URL="https://<api-domain>"
export WIDGET_ADMIN_KEY="<widget-admin-key>"
npm run qa:pilot
```

```powershell
# PowerShell
$env:API_BASE_URL="https://<api-domain>"
$env:WIDGET_ADMIN_KEY="<widget-admin-key>"
npm run qa:pilot
```
