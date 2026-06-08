-- Per-IP rate limiting for the widget-chat endpoint
create table if not exists widget_rate_limits (
  ip            text        not null,
  window_start  timestamptz not null,
  request_count integer     not null default 1,
  constraint widget_rate_limits_pkey primary key (ip, window_start)
);

create index if not exists widget_rate_limits_window_idx
  on widget_rate_limits (window_start);

-- Atomically increment the counter for (ip, current minute window)
-- and return the new count. Cleans up windows older than 5 minutes
-- on each call so the table stays small.
create or replace function check_widget_rate_limit(p_ip text)
returns integer
language plpgsql
security definer
as $$
declare
  v_window timestamptz := date_trunc('minute', now());
  v_count  integer;
begin
  -- Prune stale windows
  delete from widget_rate_limits
  where window_start < now() - interval '5 minutes';

  -- Atomic upsert: insert 1, or increment existing
  insert into widget_rate_limits (ip, window_start, request_count)
  values (p_ip, v_window, 1)
  on conflict (ip, window_start)
  do update set request_count = widget_rate_limits.request_count + 1
  returning request_count into v_count;

  return v_count;
end;
$$;

-- Allow the service role (used by Edge Functions) to call this function
grant execute on function check_widget_rate_limit(text) to service_role;
