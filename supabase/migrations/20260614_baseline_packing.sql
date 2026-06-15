alter table profiles
  add column if not exists baseline_packing_list jsonb not null default '[]'::jsonb;
