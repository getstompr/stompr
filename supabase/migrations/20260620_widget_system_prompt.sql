-- Allow per-tenant custom AI system prompts; null = use the built-in default
alter table tenants
  add column if not exists system_prompt text;
