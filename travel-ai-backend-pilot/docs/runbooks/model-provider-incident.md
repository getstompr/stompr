# Model Provider Outage Triage (OpenAI / Claude)

Use this when chat quality degrades, latency spikes, or model calls fail while infrastructure stays healthy.

## Symptoms
- `/health` is green but `/v1/chat/message` fails or times out.
- Increased fallback usage in audit events (`modelProvider` shifts).
- Higher response latency without ALB/ECS saturation.

## Immediate triage
1. Confirm API and infra baseline:
```bash
curl -sS https://<api-domain>/health
```
2. Check ECS logs for provider error signatures (auth, rate limit, upstream timeout).
3. Query recent audits for provider mix and failures:
```bash
curl -sS "https://<api-domain>/v1/audit?tenantId=<tenant-id>"
```

## Decision and actions
1. If primary provider is failing and fallback is healthy:
- Keep service online.
- Switch routing to known-good provider in deploy config.
- Redeploy ECS service.

2. If both providers are failing:
- Verify secrets are valid and not expired.
- Rotate model API keys if auth failures are observed.
- If unresolved quickly, execute rollback runbook.

## Failover verification
After any routing or key change, run smoke checks:
1. `/v1/widget/token`
2. `/v1/chat/session`
3. `/v1/chat/message`
4. `/v1/handoff/escalate`

## Notes
- Prefer provider routing change + redeploy over immediate rollback when core infra is healthy.
- Record incident timestamps, affected tenants, and final routing state.
