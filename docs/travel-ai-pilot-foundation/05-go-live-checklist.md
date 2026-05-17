# Go-Live Checklist (Pilot)

## Engineering-owned
- Confirm production env preflight validation passes.
- Run smoke tests for:
  - Health endpoint.
  - Widget token mint.
  - Session creation.
  - Message roundtrip.
  - Escalation path.
- Verify model provider primary/fallback routing works.
- Verify audit event paths and basic alert coverage.
- Confirm rollback command path and last-good release reference.

## Human-owned
- Approve DNS/TLS and production domain routing.
- Populate and rotate all production secrets.
- Lock CORS origins to pilot agency domains.
- Confirm CRM credentials and permissions per pilot tenant.
- Assign on-call and alert destination.
- Approve customer-facing policy language (privacy, AI assist disclaimer).

## Exit criteria before paid pilots
- Two clean end-to-end rehearsals in production-like conditions.
- Three scripted journey QA scenarios passing consistently.
- Observability baseline accepted (latency/error thresholds).
- Rollback drill completed once with documented timing.

## Cost posture
- Keep minimal-cost single-task production baseline initially.
- Scale availability and multi-AZ posture only after first paying pilots validate demand.
