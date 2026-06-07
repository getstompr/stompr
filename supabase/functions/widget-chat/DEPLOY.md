# Widget Chat — Deployment & Onboarding

## 1. Run the DB migration

In the Supabase dashboard → SQL Editor, paste and run:
`supabase/migrations/20260607_widget_tenants.sql`

This creates three tables: `tenants`, `widget_tokens`, `widget_conversations`.

## 2. Deploy the Edge Function

```bash
supabase functions deploy widget-chat --no-verify-jwt
```

`--no-verify-jwt` is required because widget visitors are anonymous (no Supabase login).
Auth is handled by the `x-widget-token` header instead.

## 3. Set environment variables in Supabase

Dashboard → Settings → Edge Functions → Secrets:

| Key | Value |
|-----|-------|
| `ANTHROPIC_API_KEY` | your Anthropic key (already set for ai-chat) |
| `SUPABASE_SERVICE_ROLE_KEY` | from Settings → API |

## 4. Host the widget JS

Upload `public/stompr-widget.js` to Supabase Storage:
- Create a public bucket called `widget`
- Upload the file
- The public URL will be: `https://<project>.supabase.co/storage/v1/object/public/widget/stompr-widget.js`

## 5. Onboard a new agency (manual for now)

Run in SQL Editor, substituting real values:

```sql
-- 1. Create the tenant
insert into tenants (name, email, plan)
values ('Sunshine Travel Agency', 'owner@sunshine.com', 'starter')
returning id;

-- 2. Create a widget token for their site (use the id from above)
insert into widget_tokens (tenant_id, label, allowed_origins)
values (
  '<tenant-id-from-above>',
  'Main website',
  array['https://sunshine-travel.com']
)
returning token;
```

Send the agency their token. Their install snippet:

```html
<script
  src="https://<project>.supabase.co/storage/v1/object/public/widget/stompr-widget.js"
  data-widget-token="<token>"
  data-brand-name="Sunshine Travel Agency"
  data-accent="#FF6B35"
  async
></script>
```

## Widget attributes

| Attribute | Required | Description |
|-----------|----------|-------------|
| `data-widget-token` | Yes | Token from `widget_tokens` table |
| `data-brand-name` | No | Agency name shown in chat header |
| `data-accent` | No | Brand hex color (default `#0EA5E9`) |
| `data-api-base` | No | Override API URL (default: Supabase project URL) |
