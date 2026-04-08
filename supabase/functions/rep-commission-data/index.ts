import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ZOHO_AUTH_URL = 'https://accounts.zoho.com/oauth/v2'
const ZOHO_API_URL = 'https://www.zohoapis.com'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const clientId = Deno.env.get('ZOHO_CLIENT_ID')
  const clientSecret = Deno.env.get('ZOHO_CLIENT_SECRET')

  if (!clientId || !clientSecret) {
    return new Response(JSON.stringify({ error: 'Zoho credentials not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    // Auth check
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Parse request body
    const body = await req.json().catch(() => ({}))
    const { date_start, date_end, rep_id } = body as {
      date_start?: string
      date_end?: string
      rep_id?: string
    }

    if (!date_start || !date_end) {
      return new Response(JSON.stringify({ error: 'date_start and date_end are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Fetch reps and their company assignments
    let repsQuery = supabase.from('reps').select('*')
    if (rep_id) repsQuery = repsQuery.eq('id', rep_id)
    const { data: reps, error: repsError } = await repsQuery
    if (repsError) throw new Error(`Failed to fetch reps: ${repsError.message}`)
    if (!reps || reps.length === 0) {
      return new Response(JSON.stringify({ success: true, data: [], summary: { totalInvoiced: 0, totalCommission: 0, totalInvoices: 0 } }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Fetch all rep-company assignments
    const { data: assignments, error: assignError } = await supabase
      .from('rep_company_assignments')
      .select('rep_id, company_id')
    if (assignError) throw new Error(`Failed to fetch assignments: ${assignError.message}`)

    // Fetch all companies for name matching
    const { data: companies, error: compError } = await supabase
      .from('companies')
      .select('id, name, code')
    if (compError) throw new Error(`Failed to fetch companies: ${compError.message}`)

    // Build company lookup maps
    const companyNameToId = new Map<string, string>()
    const companyIdToName = new Map<string, string>()
    for (const c of companies || []) {
      companyNameToId.set(c.name.toLowerCase().trim(), c.id)
      companyIdToName.set(c.id, c.name)
    }

    // Build rep -> company_ids map
    const repCompanies = new Map<string, Set<string>>()
    for (const a of assignments || []) {
      if (!repCompanies.has(a.rep_id)) repCompanies.set(a.rep_id, new Set())
      repCompanies.get(a.rep_id)!.add(a.company_id)
    }

    // Build company_id -> rep_id map
    const companyToRep = new Map<string, string>()
    for (const a of assignments || []) {
      companyToRep.set(a.company_id, a.rep_id)
    }

    // Fetch Zoho invoices for the date range
    const accessToken = await getValidAccessToken(supabase, clientId, clientSecret)
    const orgId = await getOrgId(supabase)

    const invoices = await fetchZohoInvoices(accessToken, orgId, date_start, date_end)
    console.log(`Fetched ${invoices.length} Zoho invoices for ${date_start} to ${date_end}`)

    // Map invoices to reps
    type RepResult = {
      rep: typeof reps[0]
      totalInvoiced: number
      commissionEarned: number
      invoiceCount: number
      invoices: Array<{
        invoice_number: string
        customer_name: string
        date: string
        total: number
        commission: number
      }>
    }

    const repResults = new Map<string, RepResult>()
    for (const rep of reps) {
      repResults.set(rep.id, {
        rep,
        totalInvoiced: 0,
        commissionEarned: 0,
        invoiceCount: 0,
        invoices: [],
      })
    }

    for (const inv of invoices) {
      const customerName = (inv.customer_name || '').toLowerCase().trim()
      const companyId = companyNameToId.get(customerName)
      if (!companyId) continue

      const repId = companyToRep.get(companyId)
      if (!repId) continue

      const result = repResults.get(repId)
      if (!result) continue

      const invTotal = Number(inv.total) || 0
      const commission = invTotal * (result.rep.commission_rate / 100)

      result.totalInvoiced += invTotal
      result.commissionEarned += commission
      result.invoiceCount++
      result.invoices.push({
        invoice_number: inv.invoice_number || inv.number || '',
        customer_name: inv.customer_name || '',
        date: inv.date || inv.invoice_date || '',
        total: invTotal,
        commission,
      })
    }

    const data = Array.from(repResults.values()).map(r => ({
      rep_id: r.rep.id,
      rep_name: r.rep.name,
      rep_email: r.rep.email,
      commission_rate: r.rep.commission_rate,
      total_invoiced: Math.round(r.totalInvoiced * 100) / 100,
      commission_earned: Math.round(r.commissionEarned * 100) / 100,
      invoice_count: r.invoiceCount,
      invoices: r.invoices,
      companies: Array.from(repCompanies.get(r.rep.id) || []).map(cid => companyIdToName.get(cid) || cid),
    }))

    const summary = {
      totalInvoiced: data.reduce((s, d) => s + d.total_invoiced, 0),
      totalCommission: data.reduce((s, d) => s + d.commission_earned, 0),
      totalInvoices: data.reduce((s, d) => s + d.invoice_count, 0),
    }

    return new Response(JSON.stringify({ success: true, data, summary }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Rep commission data error:', error)
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Failed to calculate commission',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

async function fetchZohoInvoices(accessToken: string, orgId: string, dateStart: string, dateEnd: string) {
  const allInvoices: any[] = []
  let page = 1
  let hasMore = true

  while (hasMore && page <= 10) {
    const url = `${ZOHO_API_URL}/books/v3/invoices?organization_id=${orgId}&date_start=${dateStart}&date_end=${dateEnd}&page=${page}&per_page=200&status=paid,sent,overdue,partially_paid`
    const resp = await fetch(url, {
      headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
    })
    const data = await resp.json()
    if (!resp.ok || data.code !== 0) {
      console.error('Zoho invoice fetch error:', data.message)
      break
    }

    const invoices = data.invoices || []
    if (!invoices.length) break

    allInvoices.push(...invoices)
    hasMore = data.page_context?.has_more_page ?? false
    page++
  }

  return allInvoices
}

async function getOrgId(supabase: any): Promise<string> {
  const { data } = await supabase
    .from('zoho_tokens')
    .select('organization_id')
    .eq('id', '00000000-0000-0000-0000-000000000001')
    .single()
  if (!data?.organization_id) throw new Error('Zoho organization ID not found')
  return data.organization_id
}

async function getValidAccessToken(supabase: any, clientId: string, clientSecret: string): Promise<string> {
  const { data: tokenRow } = await supabase
    .from('zoho_tokens')
    .select('*')
    .eq('id', '00000000-0000-0000-0000-000000000001')
    .single()

  if (!tokenRow) throw new Error('No Zoho tokens found. Please connect Zoho Books first.')

  const expiresAt = new Date(tokenRow.expires_at)
  if (expiresAt.getTime() - Date.now() > 5 * 60 * 1000) {
    return tokenRow.access_token
  }

  const tokenResponse = await fetch(`${ZOHO_AUTH_URL}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: tokenRow.refresh_token,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    }),
  })

  const tokenData = await tokenResponse.json()
  if (tokenData.error) throw new Error(`Token refresh failed: ${tokenData.error}`)

  await supabase
    .from('zoho_tokens')
    .update({
      access_token: tokenData.access_token,
      expires_at: new Date(Date.now() + (tokenData.expires_in || 3600) * 1000).toISOString(),
    })
    .eq('id', '00000000-0000-0000-0000-000000000001')

  return tokenData.access_token
}
