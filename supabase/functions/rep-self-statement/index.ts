import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

    // Validate user JWT
    const authClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: userData, error: userErr } = await authClient.auth.getUser()
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const email = (userData.user.email || '').toLowerCase().trim()
    if (!email) {
      return new Response(JSON.stringify({ error: 'No email on account' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY)

    // Find matching rep by email (case-insensitive)
    const { data: reps, error: repErr } = await admin
      .from('reps')
      .select('id, name, email, commission_rate, commission_method')
    if (repErr) throw new Error(repErr.message)
    const rep = (reps || []).find(r => (r.email || '').toLowerCase().trim() === email)
    if (!rep) {
      return new Response(
        JSON.stringify({ error: 'No commission record found for your account. Contact your admin.' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Load locked payouts (invoices already committed)
    const { data: payouts, error: poErr } = await admin
      .from('commission_payouts')
      .select('*')
      .eq('rep_id', rep.id)
      .order('period_month', { ascending: false })
      .order('invoice_date', { ascending: false })
    if (poErr) throw new Error(poErr.message)

    // Load batches
    const { data: batches, error: batchErr } = await admin
      .from('commission_payout_batches')
      .select('*')
      .eq('rep_id', rep.id)
      .order('period_month', { ascending: false })
    if (batchErr && batchErr.code !== 'PGRST205') {
      // If table missing in older env, ignore silently
    }

    // Load adjustments
    const { data: adjustments, error: adjErr } = await admin
      .from('commission_adjustments')
      .select('*')
      .eq('rep_id', rep.id)
      .order('created_at', { ascending: false })
    if (adjErr && adjErr.code !== 'PGRST205') {
      // ignore
    }

    // Group payouts by period_month
    const byPeriod = new Map<string, {
      period_month: string;
      invoice_count: number;
      total_invoiced: number;
      total_commission: number;
      invoices: any[];
    }>()
    for (const p of payouts || []) {
      const key = String(p.period_month).slice(0, 7)
      if (!byPeriod.has(key)) {
        byPeriod.set(key, {
          period_month: key,
          invoice_count: 0,
          total_invoiced: 0,
          total_commission: 0,
          invoices: [],
        })
      }
      const bucket = byPeriod.get(key)!
      bucket.invoice_count += 1
      bucket.total_invoiced += Number(p.sub_total || 0)
      bucket.total_commission += Number(p.commission_amount || 0)
      bucket.invoices.push({
        invoice_id: p.invoice_id,
        invoice_number: p.invoice_number,
        customer_name: p.customer_name,
        invoice_date: p.invoice_date,
        sub_total: Number(p.sub_total || 0),
        commission_rate: Number(p.commission_rate || 0),
        commission_amount: Number(p.commission_amount || 0),
        locked_at: p.locked_at,
      })
    }

    const periods = Array.from(byPeriod.values()).sort((a, b) => b.period_month.localeCompare(a.period_month))

    const totals = {
      lifetime_commission: (payouts || []).reduce((s, p) => s + Number(p.commission_amount || 0), 0),
      lifetime_invoiced: (payouts || []).reduce((s, p) => s + Number(p.sub_total || 0), 0),
      invoice_count: (payouts || []).length,
      approved_adjustments: (adjustments || [])
        .filter(a => a.status === 'approved' || a.status === 'applied')
        .reduce((s, a) => s + Number(a.amount || 0), 0),
      open_disputes: (adjustments || []).filter(a => a.status === 'open').length,
    }

    return new Response(
      JSON.stringify({
        rep: {
          id: rep.id,
          name: rep.name,
          email: rep.email,
          commission_rate: Number(rep.commission_rate || 0),
          commission_method: rep.commission_method || 'margin_scaled',
        },
        totals,
        periods,
        batches: batches || [],
        adjustments: adjustments || [],
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err: any) {
    console.error('rep-self-statement error:', err)
    return new Response(JSON.stringify({ error: err?.message || 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
