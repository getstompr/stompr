-- Tenants: one row per travel agency that purchases the widget
create table if not exists tenants (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  name         text not null,                      -- agency display name
  email        text not null unique,               -- billing / contact email
  plan         text not null default 'starter'     -- starter | agency | enterprise
                check (plan in ('starter','agency','enterprise')),
  active       boolean not null default true,
  -- usage caps per plan (null = unlimited)
  monthly_limit  integer default 500,             -- conversations/month
  monthly_used   integer not null default 0,
  usage_reset_at timestamptz not null default date_trunc('month', now()) + interval '1 month'
);

-- Widget tokens: each tenant can have multiple tokens (one per site)
create table if not exists widget_tokens (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  token       text not null unique default encode(gen_random_bytes(32), 'hex'),
  label       text,                                -- e.g. "Main site", "Blog"
  allowed_origins text[],                          -- CORS allowlist, null = any
  active      boolean not null default true,
  last_used_at timestamptz
);

-- Conversations: one row per widget chat session
create table if not exists widget_conversations (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  token_id    uuid not null references widget_tokens(id) on delete cascade,
  session_id  text not null,                       -- anonymous browser session
  -- optional lead capture
  visitor_name  text,
  visitor_email text,
  messages    jsonb not null default '[]'::jsonb,  -- [{role, content, ts}]
  ended_at    timestamptz
);

-- Fast lookups
create index if not exists widget_tokens_token_idx on widget_tokens(token) where active = true;
create index if not exists widget_conversations_session_idx on widget_conversations(session_id);
create index if not exists widget_conversations_tenant_idx on widget_conversations(tenant_id);

-- RLS: service-role key only (the Edge Function uses service-role)
alter table tenants              enable row level security;
alter table widget_tokens        enable row level security;
alter table widget_conversations enable row level security;
