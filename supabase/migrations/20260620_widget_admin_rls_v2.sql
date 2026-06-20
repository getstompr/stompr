-- Update admin RLS policies to use emilyfernes@gmail.com

drop policy if exists "admin_tenants"              on tenants;
drop policy if exists "admin_widget_tokens"        on widget_tokens;
drop policy if exists "admin_widget_conversations" on widget_conversations;

create policy "admin_tenants" on tenants
  for all to authenticated
  using  (auth.jwt() ->> 'email' = 'emilyfernes@gmail.com')
  with check (auth.jwt() ->> 'email' = 'emilyfernes@gmail.com');

create policy "admin_widget_tokens" on widget_tokens
  for all to authenticated
  using  (auth.jwt() ->> 'email' = 'emilyfernes@gmail.com')
  with check (auth.jwt() ->> 'email' = 'emilyfernes@gmail.com');

create policy "admin_widget_conversations" on widget_conversations
  for all to authenticated
  using  (auth.jwt() ->> 'email' = 'emilyfernes@gmail.com')
  with check (auth.jwt() ->> 'email' = 'emilyfernes@gmail.com');
