alter table profiles
  add column if not exists food_prefs jsonb not null default '{}'::jsonb;
