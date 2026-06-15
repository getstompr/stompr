create table if not exists itinerary_shares (
  id                uuid primary key default gen_random_uuid(),
  itinerary_id      uuid not null references itineraries(id) on delete cascade,
  shared_by_user_id uuid not null references auth.users(id) on delete cascade,
  shared_with_email text not null,
  permission        text not null default 'view' check (permission in ('view','edit')),
  created_at        timestamptz not null default now()
);

create index if not exists itinerary_shares_itinerary_idx on itinerary_shares(itinerary_id);
create index if not exists itinerary_shares_email_idx     on itinerary_shares(shared_with_email);

alter table itinerary_shares enable row level security;

-- Owner can fully manage shares they created
create policy "Owners can manage their shares"
  on itinerary_shares for all
  using  (shared_by_user_id = auth.uid())
  with check (shared_by_user_id = auth.uid());

-- Recipients can see shares addressed to their email
create policy "Recipients can view shares"
  on itinerary_shares for select
  using (shared_with_email = auth.email());

-- Let recipients read the actual itinerary rows shared with them
create policy "Shared users can view itineraries"
  on itineraries for select
  using (
    exists (
      select 1 from itinerary_shares
      where itinerary_shares.itinerary_id = itineraries.id
        and itinerary_shares.shared_with_email = auth.email()
    )
  );
