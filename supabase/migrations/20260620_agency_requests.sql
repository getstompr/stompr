-- Agency interest/signup requests submitted from the B2B landing page
create table if not exists agency_requests (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name       text not null,
  email      text not null,
  agency     text not null,
  website    text,
  plan       text,
  dismissed  boolean not null default false
);

alter table agency_requests enable row level security;

-- Anyone (logged-out visitors) can submit a request
create policy "anon_insert_agency_requests" on agency_requests
  for insert to anon
  with check (true);

-- Only admin can read and update (dismiss) requests
create policy "admin_read_agency_requests" on agency_requests
  for select to authenticated
  using (auth.jwt() ->> 'email' = 'emilyfernes@gmail.com');

create policy "admin_update_agency_requests" on agency_requests
  for update to authenticated
  using  (auth.jwt() ->> 'email' = 'emilyfernes@gmail.com')
  with check (auth.jwt() ->> 'email' = 'emilyfernes@gmail.com');
