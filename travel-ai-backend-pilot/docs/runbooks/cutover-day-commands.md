# Cutover Day Command Runbook

This runbook is for launch day execution in order.

## Inputs required
- `AWS_REGION`
- `PROD_ECS_CLUSTER`
- `PROD_ECS_SERVICE`
- `PROD_ECS_TASK_FAMILY`
- `PROD_BASE_URL`
- `PROD_WIDGET_ADMIN_SECRET_ARN`

## 1) Trigger production deploy
Use GitHub Actions `deploy` workflow with `target_environment=prod`.

Expected workflow stages:
1. build + test
2. image push
3. config validation
4. ECS task registration
5. DB migration task
6. ECS service update
7. smoke tests

## 2) Confirm deployed task revision
```bash
aws ecs describe-services \
  --cluster "$PROD_ECS_CLUSTER" \
  --services "$PROD_ECS_SERVICE" \
  --query 'services[0].taskDefinition' \
  --output text
```

## 3) Manual API spot checks
```bash
curl -sS "$PROD_BASE_URL/health"
curl -sS "$PROD_BASE_URL/widget/v1.js" | head -n 5
```

## 4) Manual signed-token flow
```bash
WIDGET_ADMIN_KEY=$(aws secretsmanager get-secret-value --secret-id "$PROD_WIDGET_ADMIN_SECRET_ARN" --query SecretString --output text)

curl -sS -X POST "$PROD_BASE_URL/v1/widget/token" \
  -H "content-type: application/json" \
  -H "x-widget-admin-key: $WIDGET_ADMIN_KEY" \
  -d '{"tenantId":"tenant_luxe_demo","siteId":"luxevoyages.example","ttlSeconds":1800}'
```

## 5) Audit trail confirmation
```bash
curl -sS "$PROD_BASE_URL/v1/audit?tenantId=tenant_luxe_demo"
```

## 6) If cutover fails (decision)
- If failures are broad (health/5xx/latency): execute rollback runbook immediately.
- If failures are narrow and fixable in < 20 minutes: hotfix + redeploy.
- If uncertain: rollback first, then patch.
