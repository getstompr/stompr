-- Itineraries: one row per trip a user is planning
create table if not exists itineraries (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  name         text not null,
  destination  text,
  start_date   date,
  end_date     date,
  travelers    integer not null default 1,
  trip_types   text[] not null default '{}',
  -- days: [{ date: 'YYYY-MM-DD', items: [{ id, time, title, category, notes }] }]
  days         jsonb not null default '[]'::jsonb
);

create index if not exists itineraries_user_idx on itineraries(user_id);

alter table itineraries enable row level security;

create policy "Users can view their own itineraries"
  on itineraries for select
  using (auth.uid() = user_id);

create policy "Users can insert their own itineraries"
  on itineraries for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own itineraries"
  on itineraries for update
  using (auth.uid() = user_id);

create policy "Users can delete their own itineraries"
  on itineraries for delete
  using (auth.uid() = user_id);
