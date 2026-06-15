alter table itineraries
  add column if not exists food_recs jsonb not null default '[]'::jsonb;
