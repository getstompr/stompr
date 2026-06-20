-- RLS policies: allow the stompr admin to manage widget tables from the browser.
-- The edge function continues to use the service-role key (bypasses RLS).

create policy "admin_tenants" on tenants
  for all to authenticated
  using  (auth.jwt() ->> 'email' = 'emeredit@chicagobooth.edu')
  with check (auth.jwt() ->> 'email' = 'emeredit@chicagobooth.edu');

create policy "admin_widget_tokens" on widget_tokens
  for all to authenticated
  using  (auth.jwt() ->> 'email' = 'emeredit@chicagobooth.edu')
  with check (auth.jwt() ->> 'email' = 'emeredit@chicagobooth.edu');

create policy "admin_widget_conversations" on widget_conversations
  for all to authenticated
  using  (auth.jwt() ->> 'email' = 'emeredit@chicagobooth.edu')
  with check (auth.jwt() ->> 'email' = 'emeredit@chicagobooth.edu');
