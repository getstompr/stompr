alter table itineraries
  add column if not exists transport jsonb not null default '[]'::jsonb,
  add column if not exists lodging   jsonb not null default '[]'::jsonb;
