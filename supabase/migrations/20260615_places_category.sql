alter table places
  add column if not exists category text not null default 'destination',
  add column if not exists location text not null default '';
