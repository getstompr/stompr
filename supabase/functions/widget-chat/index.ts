import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const MONTHLY_LIMITS: Record<string, number | null> = {
  starter:    500,
  agency:     null, // unlimited
  enterprise: null,
}

// Build CORS headers, respecting the tenant's allowed_origins list.
function corsHeaders(req: Request, allowedOrigins: string[] | null): Record<string, string> {
  const origin = req.headers.get('origin') || '*'
  const allowed =
    !allowedOrigins || allowedOrigins.length === 0
      ? origin                                          // any origin
      : allowedOrigins.includes(origin) ? origin : ''  // must match

  return {
    'Access-Control-Allow-Origin': allowed || 'null',
    'Access-Control-Allow-Headers': 'content-type, x-widget-token',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

serve(async (req) => {
  // ── CORS preflight ──────────────────────────────────────────────────────────
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req, null) })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  // ── Auth: widget token from header ─────────────────────────────────────────
  const widgetToken = req.headers.get('x-widget-token')
  if (!widgetToken) {
    return json({ error: 'Missing x-widget-token header' }, 401)
  }

  // ── Supabase service-role client (bypasses RLS) ────────────────────────────
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // ── Validate token + load tenant ───────────────────────────────────────────
  const { data: tokenRow, error: tokenErr } = await supabase
    .from('widget_tokens')
    .select('id, tenant_id, allowed_origins, active, tenants(id, plan, active, monthly_limit, monthly_used, usage_reset_at, name)')
    .eq('token', widgetToken)
    .eq('active', true)
    .single()

  if (tokenErr || !tokenRow) {
    return json({ error: 'Invalid or inactive widget token' }, 401)
  }

  const tenant = tokenRow.tenants as Record<string, unknown>

  if (!tenant.active) {
    return json({ error: 'Tenant account is inactive' }, 403)
  }

  // ── Usage cap check ────────────────────────────────────────────────────────
  const now = new Date()
  const resetAt = new Date(tenant.usage_reset_at as string)

  // Roll over monthly counter if the reset window has passed
  if (now >= resetAt) {
    const nextReset = new Date(resetAt)
    nextReset.setMonth(nextReset.getMonth() + 1)
    await supabase
      .from('tenants')
      .update({ monthly_used: 0, usage_reset_at: nextReset.toISOString() })
      .eq('id', tenant.id)
    tenant.monthly_used = 0
  }

  const cap = MONTHLY_LIMITS[tenant.plan as string]
  if (cap !== null && (tenant.monthly_used as number) >= cap) {
    return json({ error: 'Monthly conversation limit reached' }, 429)
  }

  // ── Parse request body ─────────────────────────────────────────────────────
  let body: {
    message: string
    history?: { role: string; content: string }[]
    session_id?: string
    visitor_name?: string
    visitor_email?: string
  }

  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const { message, history = [], session_id, visitor_name, visitor_email } = body

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return json({ error: 'message is required' }, 400)
  }

  const cors = corsHeaders(req, tokenRow.allowed_origins)

  // ── Call Claude ────────────────────────────────────────────────────────────
  const systemPrompt = `You are an AI travel concierge for ${tenant.name}. Help visitors plan trips, answer destination questions, suggest itineraries, and assist with bookings. Be warm, concise, and practical. If a visitor seems ready to book, encourage them to share their contact details so an agent can follow up.`

  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [
        ...history.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user', content: message },
      ],
    }),
  })

  const aiData = await anthropicRes.json()
  if (!anthropicRes.ok) {
    console.error('Anthropic error:', aiData)
    return json({ error: 'AI service error' }, 502, cors)
  }

  const reply: string = aiData.content[0].text

  // ── Persist conversation + update usage ───────────────────────────────────
  const sid = session_id || crypto.randomUUID()
  const newMessage = { role: 'user', content: message, ts: now.toISOString() }
  const newReply   = { role: 'assistant', content: reply, ts: new Date().toISOString() }

  // Upsert conversation by session_id
  const { data: existing } = await supabase
    .from('widget_conversations')
    .select('id, messages')
    .eq('session_id', sid)
    .maybeSingle()

  if (existing) {
    const updated = [...(existing.messages as unknown[]), newMessage, newReply]
    await supabase
      .from('widget_conversations')
      .update({
        messages: updated,
        visitor_name: visitor_name || undefined,
        visitor_email: visitor_email || undefined,
      })
      .eq('id', existing.id)
  } else {
    await supabase.from('widget_conversations').insert({
      tenant_id: tenant.id,
      token_id: tokenRow.id,
      session_id: sid,
      visitor_name: visitor_name || null,
      visitor_email: visitor_email || null,
      messages: [newMessage, newReply],
    })
  }

  // Increment monthly usage and update last_used_at on the token
  await Promise.all([
    supabase
      .from('tenants')
      .update({ monthly_used: (tenant.monthly_used as number) + 1 })
      .eq('id', tenant.id),
    supabase
      .from('widget_tokens')
      .update({ last_used_at: now.toISOString() })
      .eq('id', tokenRow.id),
  ])

  return json({ reply, session_id: sid }, 200, cors)
})
