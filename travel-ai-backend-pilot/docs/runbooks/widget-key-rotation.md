# Secrets Rotation Runbook (Widget + Model Providers)

## Secrets
- `WIDGET_SIGNING_SECRET`
- `WIDGET_ADMIN_KEY`
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`

## Rotation sequence
1. Generate new secret values/keys in provider consoles.
2. Update AWS Secrets Manager values (new `AWSCURRENT` versions).
3. Force ECS service redeploy to pick up rotated secrets.
4. Validate signed token and chat paths.

## Commands
```bash
aws secretsmanager put-secret-value --secret-id <widget-signing-secret-arn> --secret-string '<new-value>'
aws secretsmanager put-secret-value --secret-id <widget-admin-secret-arn> --secret-string '<new-value>'
aws secretsmanager put-secret-value --secret-id <openai-api-key-secret-arn> --secret-string '<new-value>'
aws secretsmanager put-secret-value --secret-id <anthropic-api-key-secret-arn> --secret-string '<new-value>'

aws ecs update-service --cluster <cluster> --service <service> --force-new-deployment
```

## Validate
1. Token mint:
- `POST /v1/widget/token`
2. Session bootstrap:
- `POST /v1/chat/session`
3. Model response:
- `POST /v1/chat/message`
4. Handoff:
- `POST /v1/handoff/escalate`

## Verify
- New keys work.
- No sustained increase in `widget_error` or chat failures.
- Fallback behavior is intact if primary provider degrades.
