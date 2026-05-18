# Architecture Flowchart (Readable + GitHub-Native)

This document explains the pilot architecture in plain English and includes a GitHub-rendered flowchart.

## What format is this?
- This is **Markdown** (`.md`) with a **Mermaid** diagram.
- GitHub renders Mermaid automatically in Markdown files.
- If someone does not read diagrams, the plain-English sections below are the source of truth.

## System Purpose
Convert anonymous agency website traffic into qualified, high-intent travel leads, then hand those leads to human advisors with structured context and source grounding.

## End-to-End Flow (Human Readable)
1. A traveler opens an agency website and starts chat through the embedded widget.
2. The widget creates a signed session and sends messages to the backend API.
3. The orchestrator runs a gate router:
   - Interest discovery
   - Qualification
   - Recommendation/refinement
   - Concierge handoff
4. The orchestrator calls retrieval against tenant-specific agency knowledge (RAG), then asks model providers (OpenAI primary, Claude fallback) to generate a grounded response.
5. The assistant collects qualification slots (budget, dates, trip style, urgency, readiness).
6. When intent is high enough, it triggers concierge handoff and creates a CRM-ready payload.
7. Advisor receives escalation with summary + transcript excerpt + cited recommendations.
8. Funnel and reliability events are logged for analytics and operations.

## Key Architectural Decisions
- **B2B multi-tenant isolation:** tenant-scoped data and policy boundaries.
- **Hybrid gate routing:** hard rules first, model-based classification for ambiguous turns.
- **RAG-first recommendations:** generated suggestions are anchored to agency docs and policy.
- **Model failover:** OpenAI as primary path, Claude as fallback provider.
- **AWS minimal launch posture:** ECS/Fargate + Aurora Postgres/pgvector + CloudFront/ALB.

## Deployment Reality (Pilot Scope)
- Production-capable pilot architecture, not full enterprise scale yet.
- Single-task/single-AZ cost posture with clear scale-up path.
- Human-owned go-live dependencies remain: DNS/TLS, secrets, Terraform apply, alert routing, and pilot policy approvals.

## Architecture Diagram
```mermaid
flowchart TD
  subgraph C["Client Layer"]
    W1["Agency Website"]
    W2["Embedded Widget SDK"]
    W3["Traveler Session"]
    A1["Advisor Console (Escalations)"]
  end

  subgraph E["AWS Edge + Routing"]
    CF["CloudFront"]
    ALB["Application Load Balancer (TLS)"]
    WAF["AWS WAF (Optional)"]
  end

  W1 --> W2
  W2 --> W3
  W3 --> CF
  CF --> WAF
  WAF --> ALB

  subgraph R["ECS/Fargate API Runtime"]
    API["Fastify API"]
    TOK["/v1/widget/token"]
    SES["/v1/chat/session"]
    MSG["/v1/chat/message"]
    QUAL["/v1/lead/qualify"]
    HAND["/v1/handoff/escalate"]

    ORCH["Conversation Orchestrator"]
    GATE["Gate Router (Rules + Classifier)"]
    PROMPT["Gate-Aware Prompt Builder"]
    POL["Policy Guardrails"]
    SCORE["Qualification Scoring"]
    CLOSE["Assumptive Concierge Close"]
  end

  ALB --> API
  API --> TOK
  API --> SES
  API --> MSG
  API --> QUAL
  API --> HAND

  MSG --> ORCH
  ORCH --> GATE
  GATE --> PROMPT
  PROMPT --> POL
  POL --> SCORE
  SCORE --> CLOSE

  subgraph K["Knowledge + RAG Engine"]
    RET["Hybrid Retrieval (Semantic + Metadata)"]
    ADV["Advantage Graph Re-ranker"]
    CITE["Citation Builder"]
    MEM["Transcript/Session Memory"]
  end

  CLOSE --> RET
  RET --> ADV
  ADV --> CITE
  ORCH --> MEM

  subgraph M["Model Providers"]
    OAI["OpenAI (Primary)"]
    CLAUDE["Anthropic Claude (Fallback)"]
    FAIL["Failover Router"]
  end

  PROMPT --> FAIL
  FAIL --> OAI
  FAIL --> CLAUDE
  OAI --> ORCH
  CLAUDE --> ORCH

  subgraph D["Aurora PostgreSQL + pgvector"]
    TEN["Tenant Config + Policy"]
    LEAD["Lead Profiles + Scores"]
    CHAT["Chat Sessions + Transcripts"]
    DOC["Knowledge Documents + Metadata"]
    VEC["Vector Embeddings (pgvector)"]
    AUD["Audit Events"]
  end

  RET --> DOC
  RET --> VEC
  ORCH --> CHAT
  SCORE --> LEAD
  API --> TEN
  API --> AUD

  subgraph I["Ingestion Pipeline"]
    SRC["Sources: Website / PDF / CSV / Drive / SharePoint"]
    EXT["Extraction + Parsing"]
    CHUNK["Chunking"]
    PII["PII Tag/Redact"]
    META["Metadata Enrichment"]
    EMB["Embedding Generation"]
    IDX["Index Write + Namespace Isolation"]
    REF["Scheduled + Manual Reindex"]
  end

  SRC --> EXT --> CHUNK --> PII --> META --> EMB --> IDX --> DOC
  IDX --> VEC
  REF --> SRC

  subgraph X["CRM + Human Handoff"]
    MAP["Normalized CRM Adapter"]
    HUB["HubSpot"]
    SF["Salesforce"]
    PD["Pipedrive"]
    TASK["CRM Task Payload"]
    SUM["Structured Summary + Transcript Excerpt + Citations"]
    LIVE["Live Escalation Queue"]
  end

  HAND --> MAP
  MAP --> HUB
  MAP --> SF
  MAP --> PD
  ORCH --> TASK
  ORCH --> SUM
  ORCH --> LIVE
  A1 --> LIVE
  LIVE --> TASK

  subgraph S["Security + Operations"]
    SEC["Secrets Manager (API Keys, Signing Keys)"]
    IAM["Least-Privilege IAM Roles"]
    CORS["Origin Allowlist Controls"]
    CW["CloudWatch Logs/Metrics/Alarms"]
    KPI["Funnel Metrics: Visit -> Chat -> Qualified -> Meeting -> Booking"]
    RB["Runbooks: Rollback, Key Rotation, Provider Outage"]
  end

  API --> SEC
  API --> IAM
  API --> CORS
  API --> CW
  CW --> KPI
  CW --> RB
```

## Reader Notes for Reviewers
- If you are reviewing for product viability, focus on: gate routing, handoff quality, and CRM payload completeness.
- If you are reviewing for technical readiness, focus on: tenant isolation, provider failover behavior, and deploy/rollback runbooks.
- If you are reviewing for pilot launch risk, focus on human-owned dependencies and alert ownership.
