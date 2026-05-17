# Production Deploy Gate Checklist (Manual Approval)

Use this checklist before approving the `deploy` workflow for `prod`.

## Change quality
- [ ] `npm test` and `npm run build` passed in CI for this commit.
- [ ] No unresolved critical defects in launch paths (widget, token, chat, handoff).
- [ ] Rollback path validated for current task family.

## Environment and secrets
- [ ] Prod GitHub environment secrets are populated.
- [ ] Model provider routing is intentional for this deploy.
- [ ] Secret ARNs point to current `AWSCURRENT` values.
- [ ] CORS origins are restricted to pilot domains.

## Operational readiness
- [ ] On-call owner is available for the release window.
- [ ] Alarm destination is active (Slack/email/PagerDuty).
- [ ] Runbooks are linked in release ticket:
  - rollback
  - model provider incident
  - secrets rotation

## Post-deploy expectations
- [ ] Smoke summary shows health/widget/token/session/message/handoff all OK.
- [ ] `/v1/audit` confirms fresh launch events.
- [ ] No sustained critical alarms in first 30 minutes.
