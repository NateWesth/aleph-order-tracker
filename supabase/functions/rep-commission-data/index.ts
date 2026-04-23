import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ZOHO_AUTH_URL = 'https://accounts.zoho.com/oauth/v2'
const ZOHO_API_URL = 'https://www.zohoapis.com'
const ZOHO_ALLOWED_INVOICE_STATUSES = ['paid', 'sent', 'overdue', 'partially_paid'] as const

const normalizeCompanyName = (value: string) => value.toLowerCase().trim().replace(/\s+/g, ' ')

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^\d.-]/g, '')
    if (!cleaned) return null
    const parsed = Number(cleaned)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

const getInvoiceSubTotal = (invoice: Record<string, unknown>): number => {
  const directSubTotal =
    toNumber(invoice.sub_total) ??
    toNumber(invoice.subtotal) ??
    toNumber(invoice.total_before_tax) ??
    toNumber(invoice.total_before_tax_formatted)

  if (directSubTotal !== null) return directSubTotal

  const total = toNumber(invoice.total)
  const taxTotal =
    toNumber(invoice.tax_total) ??
    toNumber(invoice.tax_amount) ??
    toNumber(invoice.vat_total)

  if (total !== null && taxTotal !== null) {
    return Math.max(total - taxTotal, 0)
  }

  return total ?? 0
}

// Commission methods (per rep):
//
// 'margin_scaled' (default):
//   - margin >= 25%  -> full rate (e.g. 15%)
//   - margin <  25%  -> rate decreases 1% per 1% margin shortfall, floored at 0
//   - negative margin (selling below cost) -> 0% commission
//   - unknown cost -> use full rate
//
// 'half_markup_below_25':
//   - margin >= 25%  -> full rate on the line subtotal (same as above)
//   - 0 <= margin < 25%  -> commission = 50% of the markup amount (sell - cost) for the line
//     (i.e. an effective rate of margin% / 2 expressed against the line subtotal,
//      because markup = lineSubTotal * margin/(100+margin) when margin is on cost...
//      we compute it directly from cost so it's exact)
//   - negative margin -> 0% commission
//   - unknown cost -> use full rate
type CommissionMethod = 'margin_scaled' | 'half_markup_below_25'

const computeEffectiveRate = (
  fullRate: number,
  marginPct: number | null,
): number => {
  if (marginPct === null) return fullRate
  if (marginPct < 0) return 0
  if (marginPct >= 25) return fullRate
  const reduced = fullRate - (25 - marginPct)
  return Math.max(0, reduced)
}

// Returns commission AMOUNT for a single line, given the chosen method.
const computeLineCommission = (
  method: CommissionMethod,
  fullRate: number,
  lineSubTotal: number,
  qty: number,
  sellRate: number,
  cost: number | null,
): { commission: number; effectiveRate: number } => {
  let marginPct: number | null = null
  if (cost !== null && cost > 0 && sellRate > 0) {
    marginPct = ((sellRate - cost) / cost) * 100
  }

  if (method === 'half_markup_below_25') {
    if (marginPct === null) {
      // unknown cost -> full rate fallback
      return { commission: lineSubTotal * (fullRate / 100), effectiveRate: fullRate }
    }
    if (marginPct < 0) return { commission: 0, effectiveRate: 0 }
    if (marginPct >= 25) {
      return { commission: lineSubTotal * (fullRate / 100), effectiveRate: fullRate }
    }
    // 50% of the markup (profit) for the whole line
    const markup = (sellRate - (cost as number)) * qty
    const commission = Math.max(0, markup * 0.5)
    const effectiveRate = lineSubTotal > 0 ? (commission / lineSubTotal) * 100 : 0
    return { commission, effectiveRate }
  }

  // default: margin_scaled
  const rate = computeEffectiveRate(fullRate, marginPct)
  return { commission: lineSubTotal * (rate / 100), effectiveRate: rate }
}

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

    // Fetch Zoho invoices
    const accessToken = await getValidAccessToken(supabase, clientId, clientSecret)
    const orgId = await getOrgId(supabase)

    const invoiceList = await fetchZohoInvoices(accessToken, orgId, date_start, date_end)
    console.log(`Fetched ${invoiceList.length} invoices`)

    // Pre-filter: only fetch line-item details for invoices belonging to assigned reps
    const relevantInvoices = invoiceList.filter(inv =>
      matchInvoiceToAssignment(inv.customer_name || '') !== null
    )
    console.log(`${relevantInvoices.length} invoices match assigned customers; fetching line items...`)

    // Fetch line items for matched invoices in parallel batches
    const invoicesWithLines = await fetchInvoicesWithLineItems(
      accessToken,
      orgId,
      relevantInvoices,
    )

    // Build cost map from item_ids/SKUs that appear in these invoices using Zoho Items API
    const skuKeys = new Set<string>()
    for (const inv of invoicesWithLines) {
      for (const li of inv.line_items || []) {
        const key = lineItemCostKey(li)
        if (key) skuKeys.add(key)
      }
    }
    const costMap = await fetchCostPricesFromItems(accessToken, orgId, skuKeys)
    console.log(`Resolved cost prices for ${costMap.size}/${skuKeys.size} unique items`)

    // Fetch existing locked payouts for this period so we can flag/skip them.
    // A payout is keyed by (rep_id, invoice_id). Locked invoices are returned
    // for transparency but excluded from the "due" totals.
    const periodMonth = `${date_start.slice(0, 7)}-01`
    const { data: existingPayouts } = await supabase
      .from('commission_payouts')
      .select('rep_id, invoice_id, commission_amount, sub_total, locked_at')
      .eq('period_month', periodMonth)
    const lockedKey = (repId: string, invoiceId: string) => `${repId}::${invoiceId}`
    const lockedSet = new Set<string>()
    for (const p of existingPayouts || []) {
      lockedSet.add(lockedKey(p.rep_id, p.invoice_id))
    }

    // Map invoices to reps
    type RepResult = {
      rep: typeof reps[0]
      totalInvoiced: number
      commissionEarned: number
      invoiceCount: number
      lockedCommission: number
      lockedInvoiceCount: number
      isLocked: boolean
      invoices: Array<{
        invoice_id: string
        invoice_number: string
        customer_name: string
        date: string
        sub_total: number
        total: number
        commission: number
        commission_rate: number
        locked: boolean
      }>
    }

    const repResults = new Map<string, RepResult>()
    for (const rep of reps) {
      repResults.set(rep.id, {
        rep,
        totalInvoiced: 0,
        commissionEarned: 0,
        invoiceCount: 0,
        lockedCommission: 0,
        lockedInvoiceCount: 0,
        isLocked: false,
        invoices: [],
      })
    }

    let matched = 0
    let duplicatesSkipped = 0
    const unmatchedSamples: string[] = []
    const processedInvoiceIds = new Set<string>()
    for (const inv of invoiceList) {
      // Hard dedup: never process the same invoice twice (defense-in-depth
      // beyond the Map-based dedup in fetchZohoInvoices).
      const dedupKey = String(
        inv.invoice_id || inv.invoice_number || inv.number || ''
      ).trim()
      if (dedupKey) {
        if (processedInvoiceIds.has(dedupKey)) {
          duplicatesSkipped++
          continue
        }
        processedInvoiceIds.add(dedupKey)
      }

      const target = matchInvoiceToAssignment(inv.customer_name || '')
      if (!target) {
        if (unmatchedSamples.length < 10 && inv.customer_name) {
          unmatchedSamples.push(inv.customer_name)
        }
        continue
      }
      matched++

      const result = repResults.get(target.rep_id)
      if (!result) continue

      // Use per-company override rate if set, otherwise rep default
      const fullRate = target.commission_rate ?? result.rep.commission_rate
      const method: CommissionMethod =
        (result.rep.commission_method as CommissionMethod) || 'margin_scaled'

      // Use detailed invoice (with line items) if available, else header-only
      const detailed = invoicesWithLines.find(d => d.invoice_id === inv.invoice_id) || inv
      const lineItems: any[] = detailed.line_items || []

      const invSubTotal = getInvoiceSubTotal(detailed)
      const invTotal = toNumber(detailed.total) ?? invSubTotal

      let lineCommission = 0
      let coveredLineSubTotal = 0
      let weightedRateNumerator = 0
      const lineDetails: Array<{
        name: string
        code: string
        quantity: number
        rate: number
        cost: number | null
        sub_total: number
        margin_percent: number | null
        commission_rate: number
        commission: number
      }> = []

      for (const li of lineItems) {
        const qty = toNumber(li.quantity) ?? 0
        const lineSubTotal =
          toNumber(li.item_total) ??
          toNumber(li.item_sub_total) ??
          ((toNumber(li.rate) ?? 0) * qty)

        if (lineSubTotal <= 0) continue

        const sellRate = toNumber(li.rate) ?? (qty > 0 ? lineSubTotal / qty : 0)
        const costKey = lineItemCostKey(li)
        const cost = costKey ? costMap.get(costKey) ?? null : null

        const { commission: lc, effectiveRate } = computeLineCommission(
          method,
          fullRate,
          lineSubTotal,
          qty,
          sellRate,
          cost,
        )
        lineCommission += lc
        coveredLineSubTotal += lineSubTotal
        weightedRateNumerator += lineSubTotal * effectiveRate

        const marginPct = (cost !== null && cost > 0 && sellRate > 0)
          ? ((sellRate - cost) / cost) * 100
          : null

        lineDetails.push({
          name: String(li.name || li.description || '').trim(),
          code: String(li.sku || li.item_code || '').trim(),
          quantity: qty,
          rate: sellRate,
          cost,
          sub_total: lineSubTotal,
          margin_percent: marginPct === null ? null : Math.round(marginPct * 10) / 10,
          commission_rate: Math.round(effectiveRate * 100) / 100,
          commission: Math.round(lc * 100) / 100,
        })
      }

      // If we couldn't get any line items, fall back to invoice-level full rate
      let commission: number
      let displayRate: number
      if (coveredLineSubTotal === 0) {
        commission = invSubTotal * (fullRate / 100)
        displayRate = fullRate
      } else {
        // Cover any uncovered remainder of subtotal at full rate
        const uncovered = Math.max(invSubTotal - coveredLineSubTotal, 0)
        commission = lineCommission + uncovered * (fullRate / 100)
        const totalForRate = coveredLineSubTotal + uncovered
        displayRate = totalForRate > 0
          ? (weightedRateNumerator + uncovered * fullRate) / totalForRate
          : fullRate
      }

      result.totalInvoiced += invSubTotal
      result.commissionEarned += commission
      result.invoiceCount++
      result.invoices.push({
        invoice_number: inv.invoice_number || inv.number || '',
        customer_name: inv.customer_name || '',
        date: inv.date || inv.invoice_date || '',
        sub_total: invSubTotal,
        total: invTotal,
        commission,
        commission_rate: Math.round(displayRate * 100) / 100,
        line_items: lineDetails,
      })
    }
    console.log(`Matched ${matched}/${invoiceList.length} invoices to reps. Skipped ${duplicatesSkipped} duplicates. Unmatched samples:`, unmatchedSamples)

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
    // Prefer the stable Zoho invoice_id; fall back to number only if missing.
    const invoiceId = invoice.invoice_id || invoice.invoice_number || invoice.number
    if (!invoiceId) continue
    const key = String(invoiceId).trim()
    if (!key) continue
    // First write wins — subsequent statuses for the same invoice are ignored.
    if (!uniqueInvoices.has(key)) uniqueInvoices.set(key, invoice)
  }

  return Array.from(uniqueInvoices.values())
}

// Build a stable key for an invoice line item used to look up cost.
// Prefers item_id (most reliable), then SKU, then lowercased name.
function lineItemCostKey(li: Record<string, unknown>): string | null {
  const itemId = li.item_id ? String(li.item_id).trim() : ''
  if (itemId) return `id:${itemId}`
  const sku = li.sku ? String(li.sku).trim() : ''
  if (sku) return `sku:${sku.toLowerCase()}`
  const name = li.name ? String(li.name).trim() : ''
  if (name) return `name:${name.toLowerCase()}`
  return null
}

// Fetch a single invoice with full line items
async function fetchInvoiceDetail(accessToken: string, orgId: string, invoiceId: string): Promise<any | null> {
  try {
    const url = `${ZOHO_API_URL}/books/v3/invoices/${invoiceId}?organization_id=${orgId}`
    const resp = await fetch(url, {
      headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
    })
    const data = await resp.json()
    if (!resp.ok || data.code !== 0) return null
    return data.invoice || null
  } catch (e) {
    console.error('Error fetching invoice detail:', e)
    return null
  }
}

// Fetch line items for many invoices in parallel (capped concurrency)
async function fetchInvoicesWithLineItems(
  accessToken: string,
  orgId: string,
  invoices: any[],
): Promise<any[]> {
  const results: any[] = []
  const concurrency = 8
  for (let i = 0; i < invoices.length; i += concurrency) {
    const batch = invoices.slice(i, i + concurrency)
    const detailed = await Promise.all(
      batch.map(async (inv) => {
        const id = inv.invoice_id
        if (!id) return inv
        const detail = await fetchInvoiceDetail(accessToken, orgId, id)
        return detail || inv
      }),
    )
    results.push(...detailed)
  }
  return results
}

// Fetch cost (purchase rate) for given Zoho item_ids using the Items API.
// Falls back to listing items if needed. Keys used:
//   id:<item_id>  ->  purchase_rate
//   sku:<sku>     ->  purchase_rate (resolved via items list)
async function fetchCostPricesFromItems(
  accessToken: string,
  orgId: string,
  keys: Set<string>,
): Promise<Map<string, number>> {
  const costMap = new Map<string, number>()
  if (keys.size === 0) return costMap

  const itemIds = [...keys].filter(k => k.startsWith('id:')).map(k => k.slice(3))
  const otherKeys = [...keys].filter(k => !k.startsWith('id:'))

  // 1) Fetch each item by ID in parallel batches
  const concurrency = 10
  for (let i = 0; i < itemIds.length; i += concurrency) {
    const batch = itemIds.slice(i, i + concurrency)
    await Promise.all(batch.map(async (itemId) => {
      try {
        const url = `${ZOHO_API_URL}/books/v3/items/${itemId}?organization_id=${orgId}`
        const resp = await fetch(url, {
          headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
        })
        const data = await resp.json()
        if (!resp.ok || data.code !== 0) return
        const item = data.item
        if (!item) return
        const cost =
          toNumber(item.purchase_rate) ??
          toNumber(item.last_purchase_rate) ??
          toNumber(item.cost_price) ??
          0
        if (cost > 0) {
          costMap.set(`id:${itemId}`, cost)
          if (item.sku) costMap.set(`sku:${String(item.sku).toLowerCase()}`, cost)
          if (item.name) costMap.set(`name:${String(item.name).toLowerCase()}`, cost)
        }
      } catch (e) {
        // ignore per-item errors
      }
    }))
  }

  // 2) For SKU-only / name-only keys we couldn't resolve via item_id, do a best-effort
  //    items list lookup (limited pages to stay within timeout)
  const stillMissing = otherKeys.filter(k => !costMap.has(k))
  if (stillMissing.length > 0) {
    let page = 1
    let hasMore = true
    while (hasMore && page <= 5) {
      try {
        const url = `${ZOHO_API_URL}/books/v3/items?organization_id=${orgId}&page=${page}&per_page=200`
        const resp = await fetch(url, {
          headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
        })
        const data = await resp.json()
        if (!resp.ok || data.code !== 0) break
        for (const item of data.items || []) {
          const cost =
            toNumber(item.purchase_rate) ??
            toNumber(item.last_purchase_rate) ??
            toNumber(item.cost_price) ??
            0
          if (cost > 0) {
            if (item.item_id) costMap.set(`id:${String(item.item_id)}`, cost)
            if (item.sku) costMap.set(`sku:${String(item.sku).toLowerCase()}`, cost)
            if (item.name) costMap.set(`name:${String(item.name).toLowerCase()}`, cost)
          }
        }
        hasMore = data.page_context?.has_more_page ?? false
        page++
      } catch (e) {
        break
      }
    }
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
