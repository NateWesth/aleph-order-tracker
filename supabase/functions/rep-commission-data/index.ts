import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ZOHO_AUTH_URL = 'https://accounts.zoho.com/oauth/v2'
const ZOHO_API_URL = 'https://www.zohoapis.com'
const ZOHO_ALLOWED_INVOICE_STATUSES = ['paid', 'sent', 'overdue', 'partially_paid'] as const

const normalizeCompanyName = (value: string) => value.toLowerCase().trim().replace(/\s+/g, ' ')

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

    // Fetch reps
    let repsQuery = supabase.from('reps').select('*')
    if (rep_id) repsQuery = repsQuery.eq('id', rep_id)
    const { data: reps, error: repsError } = await repsQuery
    if (repsError) throw new Error(`Failed to fetch reps: ${repsError.message}`)
    if (!reps || reps.length === 0) {
      return new Response(JSON.stringify({ success: true, data: [], summary: { totalInvoiced: 0, totalCommission: 0, totalInvoices: 0 } }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Fetch assignments WITH commission_rate override
    const { data: assignments, error: assignError } = await supabase
      .from('rep_company_assignments')
      .select('rep_id, company_id, commission_rate')
    if (assignError) throw new Error(`Failed to fetch assignments: ${assignError.message}`)

    // Fetch companies
    const { data: companies, error: compError } = await supabase
      .from('companies')
      .select('id, name, code')
    if (compError) throw new Error(`Failed to fetch companies: ${compError.message}`)

    const companyIdToName = new Map<string, string>()
    const companyById = new Map<string, { id: string; name: string; code: string }>()
    for (const c of companies || []) {
      companyIdToName.set(c.id, c.name)
      companyById.set(c.id, c)
    }

    // Build rep -> company_ids map
    const repCompanies = new Map<string, Set<string>>()
    for (const a of assignments || []) {
      if (!repCompanies.has(a.rep_id)) repCompanies.set(a.rep_id, new Set())
      repCompanies.get(a.rep_id)!.add(a.company_id)
    }

    // Each assignment becomes a fuzzy-matchable target.
    // We tokenize assigned company names and compare against invoice customer names,
    // matching when either side contains the other or they share enough tokens.
    type AssignmentTarget = {
      rep_id: string
      commission_rate: number | null
      company_id: string
      name: string
      norm: string
      tokens: Set<string>
    }
    const STOP_TOKENS = new Set(['pty', 'ltd', 'cc', 't/a', 'ta', 'the', '&', 'and', '(pty)', '(ltd)'])
    const tokenize = (s: string) =>
      new Set(
        normalizeCompanyName(s)
          .replace(/[().,/\\]/g, ' ')
          .split(/\s+/)
          .filter((t) => t.length > 1 && !STOP_TOKENS.has(t))
      )

    const assignmentTargets: AssignmentTarget[] = []
    for (const a of assignments || []) {
      const company = companyById.get(a.company_id)
      if (!company) continue
      assignmentTargets.push({
        rep_id: a.rep_id,
        commission_rate: a.commission_rate,
        company_id: a.company_id,
        name: company.name,
        norm: normalizeCompanyName(company.name),
        tokens: tokenize(company.name),
      })
    }

    const matchInvoiceToAssignment = (
      customerName: string
    ): AssignmentTarget | null => {
      const norm = normalizeCompanyName(customerName)
      if (!norm) return null
      const tokens = tokenize(customerName)

      // 1) exact normalized match
      const exact = assignmentTargets.find((t) => t.norm === norm)
      if (exact) return exact

      // 2) substring match either direction
      const sub = assignmentTargets.find(
        (t) => t.norm && (norm.includes(t.norm) || t.norm.includes(norm))
      )
      if (sub) return sub

      // 3) token overlap (need at least 2 shared meaningful tokens, or 1 if assignment only has 1)
      let best: { target: AssignmentTarget; score: number } | null = null
      for (const t of assignmentTargets) {
        let shared = 0
        for (const tok of tokens) if (t.tokens.has(tok)) shared++
        const minRequired = Math.min(2, t.tokens.size, tokens.size)
        if (shared >= minRequired && shared > 0) {
          if (!best || shared > best.score) best = { target: t, score: shared }
        }
      }
      return best?.target ?? null
    }

    // Fetch Zoho invoices and bills
    const accessToken = await getValidAccessToken(supabase, clientId, clientSecret)
    const orgId = await getOrgId(supabase)

    const [invoices, costMap] = await Promise.all([
      fetchZohoInvoices(accessToken, orgId, date_start, date_end),
      fetchCostPricesFromBills(accessToken, orgId),
    ])
    console.log(`Fetched ${invoices.length} invoices, ${costMap.size} SKU cost prices`)

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
        sub_total: number
        total: number
        commission: number
        commission_rate: number
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

    let matched = 0
    let unmatched = 0
    const unmatchedSamples: string[] = []
    for (const inv of invoices) {
      const target = matchInvoiceToAssignment(inv.customer_name || '')
      if (!target) {
        unmatched++
        if (unmatchedSamples.length < 10 && inv.customer_name) {
          unmatchedSamples.push(inv.customer_name)
        }
        continue
      }
      matched++

      const result = repResults.get(target.rep_id)
      if (!result) continue

      // Use sub_total (excl. VAT) instead of total
      const invSubTotal = Number(inv.sub_total) || 0

      // Use per-company override rate if set, otherwise rep default
      const effectiveRate = target.commission_rate ?? result.rep.commission_rate
      const commission = invSubTotal * (effectiveRate / 100)

      result.totalInvoiced += invSubTotal
      result.commissionEarned += commission
      result.invoiceCount++
      result.invoices.push({
        invoice_number: inv.invoice_number || inv.number || '',
        customer_name: inv.customer_name || '',
        date: inv.date || inv.invoice_date || '',
        sub_total: invSubTotal,
        total: Number(inv.total) || 0,
        commission,
        commission_rate: effectiveRate,
      })
    }
    console.log(`Matched ${matched}/${invoices.length} invoices to reps. Unmatched samples:`, unmatchedSamples)

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

    return new Response(JSON.stringify({ success: true, data, summary, cost_prices: Object.fromEntries(costMap) }), {
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
  for (const status of ZOHO_ALLOWED_INVOICE_STATUSES) {
    let page = 1
    let hasMore = true

    while (hasMore && page <= 10) {
      const params = new URLSearchParams({
        organization_id: orgId,
        date_start: dateStart,
        date_end: dateEnd,
        page: String(page),
        per_page: '200',
        status,
      })

      const resp = await fetch(`${ZOHO_API_URL}/books/v3/invoices?${params.toString()}`, {
        headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
      })
      const data = await resp.json()
      if (!resp.ok || data.code !== 0) {
        console.error(`Zoho invoice fetch error for status ${status}:`, data.message)
        break
      }

      const invoices = data.invoices || []
      if (!invoices.length) break

      allInvoices.push(...invoices)
      hasMore = data.page_context?.has_more_page ?? false
      page++
    }
  }

  const uniqueInvoices = new Map<string, any>()
  for (const invoice of allInvoices) {
    const invoiceId = invoice.invoice_id || invoice.invoice_number || invoice.number
    if (invoiceId) uniqueInvoices.set(String(invoiceId), invoice)
  }

  return Array.from(uniqueInvoices.values())
}

// Fetch cost prices from recent vendor bills (last 100) by SKU
async function fetchCostPricesFromBills(accessToken: string, orgId: string): Promise<Map<string, number>> {
  const costMap = new Map<string, number>()
  try {
    // Get recent bills
    const url = `${ZOHO_API_URL}/books/v3/bills?organization_id=${orgId}&per_page=50&sort_column=date&sort_order=D`
    const resp = await fetch(url, {
      headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
    })
    const data = await resp.json()
    if (!resp.ok || data.code !== 0) {
      console.error('Zoho bills fetch error:', data.message)
      return costMap
    }

    const bills = data.bills || []
    // Fetch line items for up to 20 recent bills to avoid timeout
    const billsToFetch = bills.slice(0, 20)
    for (const bill of billsToFetch) {
      try {
        const detailUrl = `${ZOHO_API_URL}/books/v3/bills/${bill.bill_id}?organization_id=${orgId}`
        const detailResp = await fetch(detailUrl, {
          headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
        })
        const detailData = await detailResp.json()
        if (detailResp.ok && detailData.code === 0 && detailData.bill?.line_items) {
          for (const item of detailData.bill.line_items) {
            const sku = (item.sku || item.item_id || '').toString().trim()
            if (sku) {
              costMap.set(sku.toLowerCase(), Number(item.rate) || 0)
            }
          }
        }
      } catch (e) {
        console.error('Error fetching bill detail:', e)
      }
    }
  } catch (e) {
    console.error('Error fetching bills:', e)
  }
  return costMap
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
