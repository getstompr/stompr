alter table itineraries
  add column if not exists shared_expenses jsonb not null default '{}'::jsonb;
