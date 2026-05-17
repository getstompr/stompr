# Rollback Runbook (ECS)

## Trigger conditions
- Elevated 5xx, failed smoke tests, regression in chat/widget/token flow.

## Decision tree (pilot)
1. If `/health` fails or ALB 5xx alarm is sustained for 5+ minutes -> rollback immediately.
2. If only one feature path is degraded and a fix is low-risk within 20 minutes -> hotfix and redeploy.
3. If root cause is unclear within 10 minutes -> rollback first, diagnose after stability is restored.
4. If model provider outage only (OpenAI/Claude) but fallback path still healthy -> do not rollback; use provider outage runbook.

## Steps
1. Identify prior stable task definition revision:
```bash
aws ecs list-task-definitions --family-prefix <task-family> --sort DESC
```
2. Update service to previous revision:
```bash
aws ecs update-service --cluster <cluster> --service <service> --task-definition <task-def-arn> --force-new-deployment
```
3. Wait for stabilization:
```bash
aws ecs wait services-stable --cluster <cluster> --services <service>
```
4. Run smoke tests on `/health`, `/widget/v1.js`, `/v1/chat/session`, `/v1/chat/message`, `/v1/handoff/escalate`.

## Verify
- CloudWatch alarms clear
- Manual widget flow succeeds
- Signed token flow succeeds (`/v1/widget/token`)
