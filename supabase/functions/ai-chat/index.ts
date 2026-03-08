import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const DAILY_LIMIT = 20 // max messages per user per day

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('credits, daily_messages_count, daily_messages_date')
      .eq('id', user.id)
      .single()

    if (!profile || profile.credits <= 0) {
      return new Response(JSON.stringify({ error: 'no_credits' }), {
        status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Reset daily count if it's a new day
    const today = new Date().toISOString().split('T')[0]
    const dailyCount = profile.daily_messages_date === today ? (profile.daily_messages_count || 0) : 0

    if (dailyCount >= DAILY_LIMIT) {
      return new Response(JSON.stringify({ error: 'daily_limit' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { message, history, systemPrompt } = await req.json()

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
        system: systemPrompt || 'You are a helpful travel assistant for Stompr. Help users plan trips, suggest destinations, create packing lists, and answer travel questions. Be concise and practical.',
        messages: [
          ...(history || []),
          { role: 'user', content: message }
        ],
      }),
    })

    const aiData = await anthropicRes.json()
    if (!anthropicRes.ok) throw new Error(aiData.error?.message || 'AI API error')

    const responseText = aiData.content[0].text
    const newCredits = profile.credits - 1

    await supabase
      .from('profiles')
      .update({
        credits: newCredits,
        daily_messages_count: dailyCount + 1,
        daily_messages_date: today,
      })
      .eq('id', user.id)

    return new Response(JSON.stringify({
      message: responseText,
      credits_remaining: newCredits,
      daily_remaining: DAILY_LIMIT - (dailyCount + 1),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
