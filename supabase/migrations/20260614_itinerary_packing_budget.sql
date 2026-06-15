alter table itineraries
  add column if not exists packing_list jsonb not null default '[]'::jsonb,
  add column if not exists budget       jsonb not null default '{}'::jsonb,
  add column if not exists expenses     jsonb not null default '[]'::jsonb;
