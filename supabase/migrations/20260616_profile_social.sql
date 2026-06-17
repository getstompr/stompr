alter table profiles
  add column if not exists bio       text not null default '',
  add column if not exists instagram text not null default '';
