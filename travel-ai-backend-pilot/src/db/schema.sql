CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS tenants (
  tenant_id TEXT PRIMARY KEY,
  tenant_name TEXT NOT NULL,
  pod_id TEXT NOT NULL,
  allowed_domains TEXT[] NOT NULL DEFAULT '{}',
  crm_provider TEXT NOT NULL,
  data_retention_days INT NOT NULL,
  encryption_key_id TEXT NOT NULL,
  high_intent_threshold REAL NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS funnel_metrics (
  tenant_id TEXT PRIMARY KEY REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  visits INT NOT NULL DEFAULT 0,
  chats_started INT NOT NULL DEFAULT 0,
  qualified_leads INT NOT NULL DEFAULT 0,
  meetings_booked INT NOT NULL DEFAULT 0,
  bookings INT NOT NULL DEFAULT 0,
  ctr_to_signup REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ingest_sources (
  tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  source_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  uri TEXT NOT NULL,
  enabled BOOLEAN NOT NULL,
  sync_mode TEXT NOT NULL,
  domain TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, source_id)
);

CREATE TABLE IF NOT EXISTS knowledge_documents (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  source_id TEXT NOT NULL,
  title TEXT NOT NULL,
  domain TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB NOT NULL,
  embedding VECTOR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_knowledge_docs_tenant ON knowledge_documents (tenant_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_docs_domain ON knowledge_documents (tenant_id, domain);
CREATE INDEX IF NOT EXISTS idx_knowledge_docs_embedding ON knowledge_documents USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE TABLE IF NOT EXISTS chat_sessions (
  session_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS leads (
  session_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS qualifications (
  session_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS handoffs (
  handoff_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audits (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  metadata JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audits_tenant_created ON audits (tenant_id, created_at DESC);
