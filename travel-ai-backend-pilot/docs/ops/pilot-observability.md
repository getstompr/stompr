# Pilot Observability Map and Alarm Tuning

This guide maps user-facing behaviors to existing CloudWatch alarms and defines pilot-friendly tuning defaults.

## Behavior -> Signal map
| Behavior | Primary endpoint/path | Primary signal | CloudWatch alarm |
|---|---|---|---|
| API availability | `/health` | ALB target 5xx | `*-alb-5xx` |
| Widget bootstrap | `/widget/v1.js` | ALB 5xx + p95 latency | `*-alb-5xx`, `*-alb-p95-latency` |
| Chat response quality/latency | `/v1/chat/message` | p95 latency, ECS task count, logs | `*-alb-p95-latency`, `*-ecs-running-task-count` |
| Handoff stability | `/v1/handoff/escalate` | ALB 5xx + DB connection pressure | `*-alb-5xx`, `*-aurora-connections` |
| DB health for retrieval/session | Aurora backend | CPU + free storage + connections | `*-aurora-cpu`, `*-aurora-free-storage`, `*-aurora-connections` |

## Pilot tuning defaults (minimal-cost)
Use these defaults for first 1-3 pilot tenants:
- `alb-5xx`: keep threshold at 5 per minute, 1 evaluation period.
- `alb-p95-latency`: keep threshold at 1.5s, 3 evaluation periods.
- `ecs-running-task-count`: threshold `< 1` for 2 periods.
- `aurora-cpu`: 80% for 3 periods.
- `aurora-connections`: 200 for 3 periods.
- `aurora-free-storage`: 2 GiB threshold.

## Noise control recommendations
- Route alarms to a single on-call channel for pilot.
- Keep warning-only notifications for temporary p95 spikes during launch day.
- Treat sustained ALB 5xx and ECS task-count alarms as paging events.
- If WAF is enabled, alert on unusual spikes in WAF blocked requests and review sampled requests for false positives.

## Operational checks during pilot
1. Run smoke checks after each deploy.
2. Review `/v1/audit` daily for provider/fallback trends.
3. Track conversion funnel + technical reliability side by side.
