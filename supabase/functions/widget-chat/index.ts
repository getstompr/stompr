import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const MONTHLY_LIMITS: Record<string, number | null> = {
  starter:    500,
  agency:     null, // unlimited
  enterprise: null,
}

const RATE_LIMIT_PER_MINUTE = 10

function getClientIp(req: Request): string {
  return (
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-real-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    'unknown'
  )
}

function corsHeaders(req: Request, allowedOrigins: string[] | null): Record<string, string> {
  const origin = req.headers.get('origin') || '*'
  const allowed =
    !allowedOrigins || allowedOrigins.length === 0
      ? origin
      : allowedOrigins.includes(origin) ? origin : ''

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

async function sendLeadNotification({
  tenantName,
  tenantEmail,
  visitorName,
  visitorEmail,
  messages,
}: {
  tenantName: string
  tenantEmail: string
  visitorName: string | null
  visitorEmail: string
  messages: { role: string; content: string }[]
}) {
  const resendKey = Deno.env.get('RESEND_API_KEY')
  if (!resendKey) return

  const visitorLabel = visitorName ? `${visitorName} (${visitorEmail})` : visitorEmail

  const messageRows = messages.map(m => `
    <div style="margin-bottom:12px;">
      <div style="font-size:0.68rem;font-weight:800;text-transform:uppercase;color:${m.role === 'user' ? '#7C3AED' : '#0EA5E9'};margin-bottom:2px;">${m.role}</div>
      <div style="font-size:0.88rem;color:#374151;line-height:1.5;">${m.content.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
    </div>`).join('')

  const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;color:#111;">
  <div style="background:#0EA5E9;padding:24px 32px;border-radius:12px 12px 0 0;">
    <h1 style="color:white;margin:0;font-size:1.1rem;font-weight:800;">New lead via ${tenantName}</h1>
  </div>
  <div style="background:white;padding:28px 32px;border:1px solid #E5E7EB;border-top:none;border-radius:0 0 12px 12px;">
    <p style="margin:0 0 6px;font-size:1rem;font-weight:700;">${visitorName || 'Anonymous visitor'}</p>
    <p style="margin:0 0 24px;color:#6B7280;font-size:0.88rem;">${visitorEmail}</p>
    <a href="mailto:${visitorEmail}" style="display:inline-block;background:#0EA5E9;color:white;padding:10px 22px;border-radius:8px;text-decoration:none;font-weight:700;font-size:0.88rem;">Reply to ${visitorName || visitorEmail} →</a>
    <hr style="margin:28px 0;border:none;border-top:1px solid #F3F4F6;" />
    <p style="margin:0 0 14px;font-weight:700;font-size:0.8rem;color:#6B7280;text-transform:uppercase;letter-spacing:0.05em;">Their conversation</p>
    ${messageRows}
    <hr style="margin:28px 0;border:none;border-top:1px solid #F3F4F6;" />
    <p style="margin:0;font-size:0.72rem;color:#9CA3AF;">Sent by <a href="https://stompr.io" style="color:#9CA3AF;">Stompr</a></p>
  </div>
</div>`

  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Stompr Leads <leads@stompr.io>',
        to: [tenantEmail],
        subject: `New lead: ${visitorLabel}`,
        html,
      }),
    })
  } catch (err) {
    console.error('Lead notification failed:', err)
  }
}

serve(async (req) => {
  // ── CORS preflight ──────────────────────────────────────────────────────────
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req, null) })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  // ── IP rate limit ───────────────────────────────────────────────────────────
  const clientIp = getClientIp(req)
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  if (clientIp !== 'unknown') {
    const { data: reqCount, error: rlErr } = await supabase
      .rpc('check_widget_rate_limit', { p_ip: clientIp })

    if (rlErr) {
      console.error('Rate limit check failed:', rlErr.message)
    } else if (reqCount > RATE_LIMIT_PER_MINUTE) {
      return json(
        { error: 'Too many requests. Please wait a moment and try again.' },
        429,
        { 'Retry-After': '60', ...corsHeaders(req, null) },
      )
    }
  }

  // ── Auth: widget token ──────────────────────────────────────────────────────
  const widgetToken = req.headers.get('x-widget-token')
  if (!widgetToken) {
    return json({ error: 'Missing x-widget-token header' }, 401)
  }

  const { data: tokenRow, error: tokenErr } = await supabase
    .from('widget_tokens')
    .select('id, tenant_id, allowed_origins, active, tenants(id, plan, active, monthly_limit, monthly_used, usage_reset_at, name, email, system_prompt)')
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

  // ── Usage cap ───────────────────────────────────────────────────────────────
  const now = new Date()
  const resetAt = new Date(tenant.usage_reset_at as string)

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

  // ── Parse body ──────────────────────────────────────────────────────────────
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

  // ── Call Claude ─────────────────────────────────────────────────────────────
  const defaultPrompt = `You are an expert AI travel concierge for {{brand_name}}. Your goal is to hook visitors with a personalized teaser itinerary, then convert them into leads for the agency's travel specialists.

CONVERSATION FLOW:
Step 1 — Greet warmly and ask where they want to go.
Step 2 — Collect these details through natural conversation, one or two at a time (never ask all at once):
  • Destination or region
  • Travel month or dates
  • Party size and type (solo / couple / family with kids / group)
  • Trip vibe (beach & relax / culture & history / adventure / food & wine / honeymoon / other)
  • Budget feel (budget-friendly / mid-range / luxury)
Step 3 — Once you have enough context, generate a TEASER ITINERARY:
  • Cover only 2–3 days of what will be a longer trip — never the full length
  • Be specific: name real neighborhoods, landmarks, and local experiences
  • Mention cuisine styles and meal types but NO specific restaurant names
  • NO hotel names, NO prices, NO bookable links — keep it tantalizing, not complete
  • End with "..." to signal there is more
  • Follow with: "This is just a taste — the full [X]-day itinerary goes much deeper. Drop your name and email below and one of our specialists will send you the complete plan with hotel picks, restaurant recommendations, and pricing."
Step 4 — Answer any travel questions naturally throughout: visa info, best time to visit, what to pack, local customs, etc. Keep answers under 180 words.

TONE: Sound like a knowledgeable friend who has been there — warm, specific, and confident. Never generic.`
  const systemPrompt = ((tenant.system_prompt as string | null) || defaultPrompt)
    .replace(/\{\{brand_name\}\}/g, tenant.name as string)

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

  // ── Persist conversation ────────────────────────────────────────────────────
  const sid = session_id || crypto.randomUUID()
  const newMessage = { role: 'user', content: message, ts: now.toISOString() }
  const newReply   = { role: 'assistant', content: reply, ts: new Date().toISOString() }

  const { data: existing } = await supabase
    .from('widget_conversations')
    .select('id, messages, visitor_email, lead_notified')
    .eq('session_id', sid)
    .maybeSingle()

  // A lead is "new" if we just received an email we didn't have before
  const isNewLead = !!visitor_email && !existing?.visitor_email && !existing?.lead_notified

  if (existing) {
    const updated = [...(existing.messages as unknown[]), newMessage, newReply]
    await supabase
      .from('widget_conversations')
      .update({
        messages: updated,
        visitor_name: visitor_name || undefined,
        visitor_email: visitor_email || undefined,
        ...(isNewLead ? { lead_notified: true } : {}),
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
      lead_notified: !!visitor_email,
    })
  }

  // ── Send lead notification (fire-and-forget) ────────────────────────────────
  if (isNewLead || (!existing && visitor_email)) {
    sendLeadNotification({
      tenantName:   tenant.name as string,
      tenantEmail:  tenant.email as string,
      visitorName:  visitor_name || null,
      visitorEmail: visitor_email!,
      messages:     [...history, { role: 'user', content: message }, { role: 'assistant', content: reply }],
    })
  }

  // ── Update usage ────────────────────────────────────────────────────────────
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
