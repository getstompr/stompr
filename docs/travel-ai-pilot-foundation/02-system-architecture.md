# System Architecture

## Topology
- Shared control plane: tenant config, prompt/version management, analytics, deployment controls.
- Per-client execution boundaries: tenant-specific data namespaces for retrieval and runtime isolation.

## Data and RAG pipeline
1. Source ingestion: website content, PDF/document uploads, optional drive/connectors.
2. Processing: parse, chunk, metadata enrichment, PII checks, embedding generation.
3. Indexing: PostgreSQL + pgvector for transactional and vector retrieval.
4. Retrieval: semantic similarity + metadata filtering + policy-aware ranking.

## Conversation orchestration
- Gate router before generation:
  - Stage A rules: obvious intent/safety/handoff/missing-critical-slot checks.
  - Stage B model classifier: resolves ambiguous gate selection.
  - Fallback: qualification gate when confidence is low.
- Gate flow:
  1. Interest discovery.
  2. Qualification.
  3. Recommendation/refinement.
  4. Concierge handoff.

## Widget and API layer
- Embeddable web widget with branded UI.
- Session + token flow for controlled embedding.
- Key endpoints:
  - `POST /v1/widget/token`
  - `POST /v1/chat/session`
  - `POST /v1/chat/message`
  - `POST /v1/lead/qualify`
  - `POST /v1/handoff/escalate`

## Infrastructure baseline (AWS)
- Compute: ECS Fargate.
- DB: Aurora PostgreSQL with pgvector.
- Edge: ALB + CloudFront.
- Secrets: Secrets Manager.
- Observability: CloudWatch logs, metrics, alarms.
- IaC: Terraform.

## Security posture
- Per-tenant authorization and namespace isolation.
- PII-aware ingestion/processing.
- Audit logging.
- CORS allowlisting by approved agency domains.

## Recommended immediate hardening
- Ensure all production retrieval uses real semantic embeddings.
- Strengthen DB-level tenant access invariants where needed.
- Verify alarm notifications and incident routing are wired for on-call.
