import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
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
//   Commission is ALWAYS calculated per line using vendor cost and quantity.
//   - margin >= 25%  -> commission = fullRate% of the line cost basis (cost × qty)
//   - 0 <= margin < 25%  -> commission = 50% of the profit (split in half)
//   - negative margin -> 0% commission
//   - unknown cost -> 0% commission (skip line, never overpay)
type CommissionMethod = 'margin_scaled' | 'half_markup_below_25'

const computeEffectiveRate = (
  fullRate: number,
  marginPct: number | null,
): number => {
  if (marginPct === null) return fullRate
  if (marginPct < 0) return 0
  if (marginPct >= 24.99) return fullRate
  const reduced = fullRate - (25 - marginPct)
  return Math.max(0, reduced)
}

// Returns commission AMOUNT for a single line, given the chosen method.
// Zero-cost lines (cost === 0) are treated as "no commissionable margin" and
// earn nothing — a real vendor cost of 0 usually means the item was mis-billed
// or given away; paying commission on a "100% margin" from a zero cost would
// hugely overpay. Negative margins (selling below cost) are floored at 0 too.
const computeLineCommission = (
  method: CommissionMethod,
  fullRate: number,
  lineSubTotal: number,
  qty: number,
  sellRate: number,
  cost: number | null,
): { commission: number; effectiveRate: number; excluded_reason?: 'zero_cost' | 'negative_margin' | 'unknown_cost' } => {
  // Explicit zero cost — never earn commission on this line.
  if (cost !== null && cost <= 0) {
    return { commission: 0, effectiveRate: 0, excluded_reason: 'zero_cost' }
  }

  let marginPct: number | null = null
  const hasRealCost = cost !== null && cost > 0
  if (hasRealCost && sellRate > 0) {
    marginPct = ((sellRate - (cost as number)) / (cost as number)) * 100
  }

  if (method === 'half_markup_below_25') {
    if (marginPct === null) {
      return { commission: 0, effectiveRate: 0, excluded_reason: 'unknown_cost' }
    }
    if (marginPct < 0) return { commission: 0, effectiveRate: 0, excluded_reason: 'negative_margin' }

    const costBasis = (cost as number) * qty
    const profit = (sellRate - (cost as number)) * qty
    const commission = marginPct >= 25
      ? costBasis * (fullRate / 100)
      : Math.max(0, profit * 0.5)
    const effectiveRate = lineSubTotal > 0 ? (commission / lineSubTotal) * 100 : 0
    return { commission, effectiveRate }
  }

  // default: margin_scaled
  if (marginPct !== null && marginPct < 0) {
    return { commission: 0, effectiveRate: 0, excluded_reason: 'negative_margin' }
  }
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

  let cacheFallback: { periodMonth: string; repId?: string } | null = null

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
    const { date_start, date_end, rep_id, force_refresh } = body as {
      date_start?: string
      date_end?: string
      rep_id?: string
      force_refresh?: boolean
    }

    if (!date_start || !date_end) {
      return new Response(JSON.stringify({ error: 'date_start and date_end are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (force_refresh) {
      const { data: isAdmin, error: roleError } = await supabase.rpc('has_role', {
        _user_id: user.id,
        _role: 'admin',
      })
      if (roleError) throw new Error(`Failed to verify admin access: ${roleError.message}`)
      if (!isAdmin) {
        return new Response(JSON.stringify({ error: 'Only admins can refresh Zoho commission data' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    const periodMonth = `${date_start.slice(0, 7)}-01`
    cacheFallback = { periodMonth, repId: rep_id }
    if (!force_refresh) {
      const cachedReport = await readCachedCommissionReport(supabase, periodMonth, rep_id)
      // Older cached reports were saved before the unresolved-cost detection
      // existed. Treat those as stale so we recompute and surface missing costs.
      const hasUnresolvedField = cachedReport
        && Object.prototype.hasOwnProperty.call(cachedReport.report as any, 'unresolved_cost_items')
      if (cachedReport && hasUnresolvedField) {
        const report = await applyLockedPayoutsToReport(supabase, cachedReport.report, periodMonth)
        return new Response(JSON.stringify({
          ...report,
          cached: true,
          refreshed_at: cachedReport.refreshed_at,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
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

    // Fetch credit notes for the same period so we can deduct refunds/returns
    // from rep commission. Map by referenced invoice_id.
    const creditByInvoiceId = await fetchCreditNotesByInvoice(accessToken, orgId, date_start, date_end)
    console.log(`Fetched ${creditByInvoiceId.size} invoices with credit notes`)

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

    // ---------------------------------------------------------------------
    // Cost resolution: STRICT name + description match against vendor bills.
    // The Zoho item list is NOT used — only vendor bill line items count as
    // authoritative cost, matching exactly on (item name, description).
    // Admin-entered overrides in commission_item_cost_overrides win over bills
    // so unresolved items can be fixed manually instead of being silently
    // skipped.
    // ---------------------------------------------------------------------
    const lineCostSignatures = new Set<string>()
    const signatureSamples = new Map<string, { name: string; description: string; sample_invoice_number?: string; sample_customer?: string }>()
    for (const inv of invoicesWithLines) {
      for (const li of inv.line_items || []) {
        const sig = lineCostSignature(li)
        if (!sig) continue
        lineCostSignatures.add(sig)
        if (!signatureSamples.has(sig)) {
          signatureSamples.set(sig, {
            name: getLineName(li),
            description: getLineDescription(li),
            sample_invoice_number: inv.invoice_number || inv.number || undefined,
            sample_customer: inv.customer_name || undefined,
          })
        }
      }
    }

    // 1) Manual admin overrides (highest priority)
    const { data: costOverrideRows, error: costOverrideError } = await supabase
      .from('commission_item_cost_overrides')
      .select('item_name, item_description, cost')
    if (costOverrideError) {
      console.warn('Failed to load commission_item_cost_overrides:', costOverrideError.message)
    }
    const overrideCostMap = new Map<string, number>()
    for (const row of costOverrideRows || []) {
      const sig = buildCostSignature(row.item_name || '', row.item_description || '')
      if (!sig) continue
      const c = Number(row.cost)
      if (Number.isFinite(c)) overrideCostMap.set(sig, c)
    }

    // 2) Vendor bill lookup for the remainder
    const stillNeeded = new Set<string>()
    for (const sig of lineCostSignatures) {
      if (!overrideCostMap.has(sig)) stillNeeded.add(sig)
    }
    const billCostMap = await fetchCostPricesFromBills(accessToken, orgId, stillNeeded, date_end)

    const costMap = new Map<string, number>()
    for (const [k, v] of billCostMap) costMap.set(k, v)
    for (const [k, v] of overrideCostMap) costMap.set(k, v) // overrides win

    console.log(`Resolved ${costMap.size}/${lineCostSignatures.size} item costs (${billCostMap.size} vendor bills, ${overrideCostMap.size} manual overrides)`)


    // Fetch existing locked payouts for this period so we can flag/skip them.
    // A payout is keyed by (rep_id, invoice_id). Locked invoices are returned
    // for transparency but excluded from the "due" totals.
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
      excludedLineCount: number
      excludedSubTotal: number
      invoices: Array<{
        invoice_id: string
        invoice_number: string
        customer_name: string
        date: string
        sub_total: number
        total: number
        commission: number
        commission_rate: number
        line_items: Array<{
          name: string
          code: string
          quantity: number
          rate: number
          cost: number | null
          sub_total: number
          margin_percent: number | null
          base_commission_rate: number
          commission_rate: number
          commission: number
          excluded_reason?: 'zero_cost' | 'negative_margin' | 'unknown_cost'
          discount_applied?: number
        }>
        locked: boolean
        gross_sub_total?: number
        credited_sub_total?: number
        credited_commission?: number
        write_off_amount?: number
        invoice_discount?: number
        excluded_line_count?: number
        excluded_sub_total?: number
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
        excludedLineCount: 0,
        excludedSubTotal: 0,
        invoices: [],
      })
    }

    let matched = 0
    let duplicatesSkipped = 0
    const unmatchedSamples: string[] = []
    const processedInvoiceIds = new Set<string>()
    const unresolvedCostItems: Array<{
      item_name: string
      item_description: string
      invoice_number: string
      customer_name: string
      quantity: number
      sell_rate: number
      sub_total: number
    }> = []

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

      // Invoice-level discount (applied at the footer of the invoice, not per
      // line). Zoho exposes this as discount_total / discount_amount / discount.
      // We prorate it across lines by their sub_total share so per-line margin
      // math reflects the actual money received.
      const invoiceLevelDiscount = Math.max(
        0,
        toNumber(detailed.discount_total) ??
          toNumber(detailed.discount_amount) ??
          toNumber(detailed.discount) ??
          0,
      )
      // Write-offs — amount the customer will never pay. Treated the same way
      // as a credit note: reduces both the earned subtotal and commission.
      const writeOffAmount = Math.max(0, toNumber(detailed.write_off_amount) ?? 0)

      // First pass: collect raw line rows so we can compute the discount share.
      type RawLine = {
        li: any
        qty: number
        rawSubTotal: number
        rawSellRate: number
        sig: string | null
        cost: number | null
      }
      const rawLines: RawLine[] = []
      let sumRawSubTotals = 0
      for (const li of lineItems) {
        const qty = toNumber(li.quantity) ?? 0
        const rawSubTotal =
          toNumber(li.item_total) ??
          toNumber(li.item_sub_total) ??
          ((toNumber(li.rate) ?? 0) * qty)
        if (rawSubTotal <= 0) continue
        const rawSellRate = toNumber(li.rate) ?? (qty > 0 ? rawSubTotal / qty : 0)
        const sig = lineCostSignature(li)
        const cost = sig ? (costMap.get(sig) ?? null) : null
        rawLines.push({ li, qty, rawSubTotal, rawSellRate, sig, cost })
        sumRawSubTotals += rawSubTotal
      }

      let coveredLineSubTotal = 0
      const lineDetails: Array<{
        name: string
        code: string
        quantity: number
        rate: number
        cost: number | null
        sub_total: number
        margin_percent: number | null
        base_commission_rate: number
        commission_rate: number
        commission: number
        excluded_reason?: 'zero_cost' | 'negative_margin' | 'unknown_cost'
        discount_applied?: number
      }> = []

      for (const row of rawLines) {
        const { li, qty, rawSubTotal, rawSellRate, sig, cost } = row

        // Prorate invoice-level discount by sub_total share.
        const discountShare = sumRawSubTotals > 0 && invoiceLevelDiscount > 0
          ? (rawSubTotal / sumRawSubTotals) * invoiceLevelDiscount
          : 0
        const lineSubTotal = Math.max(0, rawSubTotal - discountShare)
        const sellRate = qty > 0 ? lineSubTotal / qty : rawSellRate

        if (cost === null && lineSubTotal > 0) {
          const info = sig ? signatureSamples.get(sig) : null
          unresolvedCostItems.push({
            item_name: info?.name || getLineName(li),
            item_description: info?.description || getLineDescription(li),
            invoice_number: inv.invoice_number || inv.number || '',
            customer_name: inv.customer_name || '',
            quantity: qty,
            sell_rate: rawSellRate,
            sub_total: lineSubTotal,
          })
        }

        const { commission: lc, effectiveRate, excluded_reason } = computeLineCommission(
          method,
          fullRate,
          lineSubTotal,
          qty,
          sellRate,
          cost,
        )
        coveredLineSubTotal += lineSubTotal

        const marginPct = (cost !== null && cost > 0 && sellRate > 0)
          ? ((sellRate - cost) / cost) * 100
          : null

        lineDetails.push({
          name: getLineName(li),
          code: String(li.sku || li.item_code || '').trim(),
          quantity: qty,
          rate: sellRate,
          cost,
          sub_total: lineSubTotal,
          margin_percent: marginPct === null ? null : Math.round(marginPct * 10) / 10,
          base_commission_rate: fullRate,
          commission_rate: Math.round(effectiveRate * 100) / 100,
          commission: Math.round(lc * 100) / 100,
          ...(excluded_reason ? { excluded_reason } : {}),
          ...(discountShare > 0 ? { discount_applied: Math.round(discountShare * 100) / 100 } : {}),
        })
      }

      // Commission is computed strictly per line item (excluding VAT) using
      // the latest vendor-bill cost. If we have no line items, or no costs
      // could be resolved, we skip the invoice rather than overpay.
      let commission: number
      let displayRate: number
      if (lineDetails.length === 0) {
        commission = 0
        displayRate = 0
      } else {
        commission = lineDetails.reduce((sum, line) => sum + Number(line.commission || 0), 0)
        displayRate = coveredLineSubTotal > 0
          ? (commission / coveredLineSubTotal) * 100
          : 0
      }

      const invoiceIdStr = String(inv.invoice_id || inv.invoice_number || inv.number || '').trim()

      // Credit-note + write-off adjustment: reduce both the invoiced subtotal
      // and the commission proportionally so we never pay on returns/uncollected.
      const creditedSubTotal = creditByInvoiceId.get(invoiceIdStr) ?? 0
      const adjustmentTotal = creditedSubTotal + writeOffAmount
      const netSubTotal = Math.max(0, invSubTotal - adjustmentTotal)
      let adjustmentRatio = 0
      if (adjustmentTotal > 0 && invSubTotal > 0) {
        adjustmentRatio = Math.min(1, adjustmentTotal / invSubTotal)
      }
      const creditedCommission = commission * adjustmentRatio
      const netCommission = commission - creditedCommission

      // Excluded-line summary for this invoice.
      const excludedLines = lineDetails.filter(l => l.excluded_reason)
      const excludedSubTotal = excludedLines.reduce((s, l) => s + Number(l.sub_total || 0), 0)

      const isLocked = lockedSet.has(lockedKey(target.rep_id, invoiceIdStr))

      if (isLocked) {
        result.lockedCommission += netCommission
        result.lockedInvoiceCount++
      } else {
        result.totalInvoiced += netSubTotal
        result.commissionEarned += netCommission
        result.invoiceCount++
      }
      // Rep-level excluded totals (unlocked only, matches commissionEarned scope).
      if (!isLocked) {
        result.excludedLineCount = (result.excludedLineCount || 0) + excludedLines.length
        result.excludedSubTotal = (result.excludedSubTotal || 0) + excludedSubTotal
      }
      result.invoices.push({
        invoice_id: invoiceIdStr,
        invoice_number: inv.invoice_number || inv.number || '',
        customer_name: inv.customer_name || '',
        date: inv.date || inv.invoice_date || '',
        sub_total: netSubTotal,
        total: invTotal,
        commission: netCommission,
        commission_rate: Math.round(displayRate * 100) / 100,
        line_items: lineDetails,
        locked: isLocked,
        gross_sub_total: invSubTotal,
        credited_sub_total: Math.round(creditedSubTotal * 100) / 100,
        credited_commission: Math.round(creditedCommission * 100) / 100,
        write_off_amount: Math.round(writeOffAmount * 100) / 100,
        invoice_discount: Math.round(invoiceLevelDiscount * 100) / 100,
        excluded_line_count: excludedLines.length,
        excluded_sub_total: Math.round(excludedSubTotal * 100) / 100,
      })
    }
    console.log(`Matched ${matched}/${invoiceList.length} invoices to reps. Skipped ${duplicatesSkipped} duplicates. Unmatched samples:`, unmatchedSamples)

    // A rep is considered "fully locked" for the period when they have at least one
    // locked invoice and zero unlocked invoices remaining.
    for (const r of repResults.values()) {
      r.isLocked = r.lockedInvoiceCount > 0 && r.invoiceCount === 0
    }

    const data = Array.from(repResults.values()).map(r => ({
      rep_id: r.rep.id,
      rep_name: r.rep.name,
      rep_email: r.rep.email,
      commission_rate: r.rep.commission_rate,
      total_invoiced: Math.round(r.totalInvoiced * 100) / 100,
      commission_earned: Math.round(r.commissionEarned * 100) / 100,
      invoice_count: r.invoiceCount,
      locked_commission: Math.round(r.lockedCommission * 100) / 100,
      locked_invoice_count: r.lockedInvoiceCount,
      is_locked: r.isLocked,
      excluded_line_count: r.excludedLineCount,
      excluded_sub_total: Math.round(r.excludedSubTotal * 100) / 100,
      invoices: r.invoices,
      companies: Array.from(repCompanies.get(r.rep.id) || []).map(cid => companyIdToName.get(cid) || cid),
    }))

    const summary = {
      totalInvoiced: data.reduce((s, d) => s + d.total_invoiced, 0),
      totalCommission: data.reduce((s, d) => s + d.commission_earned, 0),
      totalInvoices: data.reduce((s, d) => s + d.invoice_count, 0),
      totalExcludedLines: data.reduce((s, d) => s + (d.excluded_line_count || 0), 0),
      totalExcludedSubTotal: data.reduce((s, d) => s + (d.excluded_sub_total || 0), 0),
    }

    // Deduplicate unresolved items by (name+description) for the UI list.
    const unresolvedByKey = new Map<string, typeof unresolvedCostItems[number] & { occurrences: number }>()
    for (const u of unresolvedCostItems) {
      const k = buildCostSignature(u.item_name, u.item_description)
      if (!k) continue
      const existing = unresolvedByKey.get(k)
      if (existing) existing.occurrences++
      else unresolvedByKey.set(k, { ...u, occurrences: 1 })
    }
    const unresolved = Array.from(unresolvedByKey.values())
      .sort((a, b) => b.occurrences - a.occurrences)

    const report = { success: true, data, summary, unresolved_cost_items: unresolved }
    await upsertCachedCommissionReport(supabase, {
      periodMonth,
      repId: rep_id ?? null,
      dateStart: date_start,
      dateEnd: date_end,
      report: normalizeCommissionReportForCache(report),
      costPrices: Object.fromEntries(costMap),
    })

    return new Response(JSON.stringify({ ...report, cost_prices: Object.fromEntries(costMap), cached: false, refreshed_at: new Date().toISOString() }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to calculate commission'
    const isRateLimit = message.toLowerCase().includes('rate limit')
    if (isRateLimit) {
      console.warn('Rep commission data paused:', message)
      if (cacheFallback) {
        try {
          const cachedReport = await readCachedCommissionReport(supabase, cacheFallback.periodMonth, cacheFallback.repId)
          if (cachedReport) {
            const report = await applyLockedPayoutsToReport(supabase, cachedReport.report, cacheFallback.periodMonth)
            return new Response(JSON.stringify({
              ...report,
              cached: true,
              stale_due_to_rate_limit: true,
              refreshed_at: cachedReport.refreshed_at,
              notice: `Zoho API rate limit reached. Showing cached data from ${cachedReport.refreshed_at}.`,
            }), {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
          }
        } catch (cacheError) {
          console.warn('Failed to return cached report after rate limit:', cacheError)
        }
      }
      return new Response(JSON.stringify({
        success: false,
        error: message,
        rate_limited: true,
        data: null,
        summary: null,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.error('Rep commission data error:', error)
    return new Response(JSON.stringify({
      error: message,
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

async function readCachedCommissionReport(supabase: any, periodMonth: string, repId?: string) {
  let query = supabase
    .from('commission_report_cache')
    .select('report, refreshed_at')
    .eq('period_month', periodMonth)
    .order('refreshed_at', { ascending: false })
    .limit(1)

  query = repId ? query.eq('rep_id', repId) : query.is('rep_id', null)

  const { data, error } = await query.maybeSingle()
  if (error) throw new Error(`Failed to read cached commission report: ${error.message}`)
  return data || null
}

async function upsertCachedCommissionReport(supabase: any, args: {
  periodMonth: string
  repId: string | null
  dateStart: string
  dateEnd: string
  report: Record<string, unknown>
  costPrices: Record<string, number>
}) {
  let deleteQuery = supabase
    .from('commission_report_cache')
    .delete()
    .eq('period_month', args.periodMonth)
  deleteQuery = args.repId ? deleteQuery.eq('rep_id', args.repId) : deleteQuery.is('rep_id', null)
  const { error: deleteError } = await deleteQuery
  if (deleteError) throw new Error(`Failed to replace cached commission report: ${deleteError.message}`)

  const { error } = await supabase.from('commission_report_cache').insert({
    period_month: args.periodMonth,
    rep_id: args.repId,
    date_start: args.dateStart,
    date_end: args.dateEnd,
    report: args.report,
    zoho_cost_prices: args.costPrices,
    refreshed_at: new Date().toISOString(),
  })
  if (error) throw new Error(`Failed to cache commission report: ${error.message}`)
}

function normalizeCommissionReportForCache(report: any) {
  const data = (report.data || []).map((rep: any) => {
    const invoices = (rep.invoices || []).map((inv: any) => ({ ...inv, locked: false }))
    const totalInvoiced = invoices.reduce((sum: number, inv: any) => sum + Number(inv.sub_total || 0), 0)
    const commissionEarned = invoices.reduce((sum: number, inv: any) => sum + Number(inv.commission || 0), 0)
    return {
      ...rep,
      invoices,
      total_invoiced: Math.round(totalInvoiced * 100) / 100,
      commission_earned: Math.round(commissionEarned * 100) / 100,
      invoice_count: invoices.length,
      locked_commission: 0,
      locked_invoice_count: 0,
      is_locked: false,
    }
  })
  return {
    ...report,
    data,
    summary: {
      totalInvoiced: data.reduce((s: number, d: any) => s + Number(d.total_invoiced || 0), 0),
      totalCommission: data.reduce((s: number, d: any) => s + Number(d.commission_earned || 0), 0),
      totalInvoices: data.reduce((s: number, d: any) => s + Number(d.invoice_count || 0), 0),
    },
  }
}

async function applyLockedPayoutsToReport(supabase: any, report: any, periodMonth: string) {
  const { data: existingPayouts, error } = await supabase
    .from('commission_payouts')
    .select('rep_id, invoice_id')
    .eq('period_month', periodMonth)
  if (error) throw new Error(`Failed to apply locked payouts: ${error.message}`)

  const lockedSet = new Set((existingPayouts || []).map((p: any) => `${p.rep_id}::${p.invoice_id}`))
  const data = (report.data || []).map((rep: any) => {
    let totalInvoiced = 0
    let commissionEarned = 0
    let invoiceCount = 0
    let lockedCommission = 0
    let lockedInvoiceCount = 0
    const invoices = (rep.invoices || []).map((inv: any) => {
      const isLocked = lockedSet.has(`${rep.rep_id}::${inv.invoice_id}`)
      if (isLocked) {
        lockedCommission += Number(inv.commission || 0)
        lockedInvoiceCount++
      } else {
        totalInvoiced += Number(inv.sub_total || 0)
        commissionEarned += Number(inv.commission || 0)
        invoiceCount++
      }
      return { ...inv, locked: isLocked }
    })

    return {
      ...rep,
      invoices,
      total_invoiced: Math.round(totalInvoiced * 100) / 100,
      commission_earned: Math.round(commissionEarned * 100) / 100,
      invoice_count: invoiceCount,
      locked_commission: Math.round(lockedCommission * 100) / 100,
      locked_invoice_count: lockedInvoiceCount,
      is_locked: lockedInvoiceCount > 0 && invoiceCount === 0,
    }
  })

  return {
    ...report,
    data,
    summary: {
      totalInvoiced: data.reduce((s: number, d: any) => s + Number(d.total_invoiced || 0), 0),
      totalCommission: data.reduce((s: number, d: any) => s + Number(d.commission_earned || 0), 0),
      totalInvoices: data.reduce((s: number, d: any) => s + Number(d.invoice_count || 0), 0),
    },
  }
}

async function fetchZohoInvoices(accessToken: string, orgId: string, dateStart: string, dateEnd: string) {
  const allInvoices: any[] = []
  const rateLimitErrors: string[] = []
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
        if (String(data.message || '').toLowerCase().includes('rate limit') || String(data.message || '').includes('maximum call rate limit')) {
          rateLimitErrors.push(`${status}: ${data.message}`)
        }
        break
      }

      const invoices = data.invoices || []
      if (!invoices.length) break

      allInvoices.push(...invoices)
      hasMore = data.page_context?.has_more_page ?? false
      page++
    }
  }

  if (rateLimitErrors.length > 0 && allInvoices.length === 0) {
    throw new Error('Zoho API rate limit reached. Please wait for the Zoho limit to reset, then refresh the commission report.')
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

// Fetch credit notes in the period and aggregate the credited SUBTOTAL
// (ex-VAT) against each referenced invoice_id. Excludes void/draft.
async function fetchCreditNotesByInvoice(
  accessToken: string,
  orgId: string,
  dateStart: string,
  dateEnd: string,
): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  let page = 1
  let hasMore = true

  while (hasMore && page <= 10) {
    const params = new URLSearchParams({
      organization_id: orgId,
      date_start: dateStart,
      date_end: dateEnd,
      page: String(page),
      per_page: '200',
    })

    let listData: any
    try {
      const resp = await fetch(`${ZOHO_API_URL}/books/v3/creditnotes?${params.toString()}`, {
        headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
      })
      listData = await resp.json()
      if (!resp.ok || listData.code !== 0) {
        console.warn('Zoho creditnotes list error:', listData?.message)
        break
      }
    } catch (e) {
      console.warn('Zoho creditnotes fetch error:', e)
      break
    }

    const notes = listData.creditnotes || []
    if (!notes.length) break

    // Fetch detail (line items include invoice_id refs) in parallel batches.
    for (let i = 0; i < notes.length; i += 8) {
      const batch = notes.slice(i, i + 8)
      const details = await Promise.all(batch.map(async (n: any) => {
        const status = String(n.status || '').toLowerCase()
        if (status === 'void' || status === 'draft') return null
        const id = n.creditnote_id
        if (!id) return null
        try {
          const r = await fetch(
            `${ZOHO_API_URL}/books/v3/creditnotes/${id}?organization_id=${orgId}`,
            { headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` } },
          )
          const d = await r.json()
          if (!r.ok || d.code !== 0) return null
          return d.creditnote || null
        } catch { return null }
      }))

      for (const cn of details) {
        if (!cn) continue
        const subTotal = toNumber(cn.sub_total) ?? toNumber(cn.total_before_tax) ?? 0
        // invoices_credited: [{ invoice_id, amount_applied }] on newer schemas.
        const invoicesCredited = Array.isArray(cn.invoices_credited) ? cn.invoices_credited : []
        if (invoicesCredited.length > 0 && subTotal > 0) {
          const gross = invoicesCredited.reduce(
            (s: number, x: any) => s + (toNumber(x.amount_applied) ?? 0),
            0,
          )
          for (const ic of invoicesCredited) {
            const invId = String(ic.invoice_id || '').trim()
            if (!invId) continue
            const applied = toNumber(ic.amount_applied) ?? 0
            // Pro-rate the ex-VAT subtotal by amount_applied share.
            const share = gross > 0 ? applied / gross : 1 / invoicesCredited.length
            map.set(invId, (map.get(invId) ?? 0) + subTotal * share)
          }
        } else {
          // Fallback: some credit notes reference invoice_id directly on the note.
          const invId = String(cn.invoice_id || '').trim()
          if (invId && subTotal > 0) {
            map.set(invId, (map.get(invId) ?? 0) + subTotal)
          }
        }
      }
    }

    hasMore = listData.page_context?.has_more_page ?? false
    page++
  }

  return map
}

// Identifiers that are shared across many unrelated items (e.g. the generic
// "M-Miscellaneous" SKU/name is reused on dozens of completely different
// custom-priced lines). For those, looking up by SKU/name produces a wrong
// shared cost — we only allow id: or desc: matches.
const GENERIC_TOKENS = new Set([
  'm-miscellaneous', 'miscellaneous', 'misc', 'm-misc',
  'n/a', 'na', '-', 'item', 'product',
])
const isGenericToken = (value: string): boolean => {
  const lowered = value.trim().toLowerCase()
  if (!lowered) return true
  if (GENERIC_TOKENS.has(lowered)) return true
  if (lowered.startsWith('m-misc')) return true
  return false
}

const SHARED_GENERIC_TOKENS = new Set([
  'm-miscellaneous', 'miscellaneous', 'misc', 'm-misc', 'item', 'product',
])
const isSharedGenericIdentifier = (value: unknown): boolean => {
  const lowered = value == null ? '' : String(value).trim().toLowerCase()
  if (!lowered) return false
  if (SHARED_GENERIC_TOKENS.has(lowered)) return true
  if (lowered.startsWith('m-misc')) return true
  return false
}

const getSalesDescription = (li: Record<string, unknown>): string => {
  const descriptionFields = [
    li.description,
    li.sales_description,
    li.item_description,
    li.purchase_description,
  ]
  for (const value of descriptionFields) {
    const normalized = value == null ? '' : String(value).trim()
    if (normalized && !isGenericToken(normalized)) return normalized
  }
  return ''
}

const getLineDisplayName = (li: Record<string, unknown>): string => {
  const salesDescription = getSalesDescription(li)
  const sku = li.sku ?? li.item_code ?? li.code
  const name = li.name
  if ((isSharedGenericIdentifier(sku) || isSharedGenericIdentifier(name)) && salesDescription) {
    return salesDescription
  }
  return String(name || salesDescription || '').trim()
}

// Extract the raw item name from a Zoho invoice/bill line.
function getLineName(li: Record<string, unknown>): string {
  const v = (li.name ?? li.item_name ?? '') as unknown
  return String(v ?? '').trim()
}

// Extract the raw item description from a Zoho invoice/bill line. Falls back
// across the common description fields Zoho uses.
function getLineDescription(li: Record<string, unknown>): string {
  const candidates = [li.description, li.sales_description, li.item_description, li.purchase_description]
  for (const v of candidates) {
    const s = String(v ?? '').trim()
    if (s) return s
  }
  return ''
}

// Composite signature used to match invoice lines to vendor bill lines and to
// admin cost overrides. BOTH name and description must match exactly
// (case-insensitive, whitespace-collapsed).
function buildCostSignature(name: string, description: string): string {
  const norm = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ')
  const n = norm(name)
  const d = norm(description)
  if (!n && !d) return ''
  return `${n}||${d}`
}

function lineCostSignature(li: Record<string, unknown>): string {
  return buildCostSignature(getLineName(li), getLineDescription(li))
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

// Fetch the LATEST vendor bill cost (excluding tax) for each requested
// (name+description) signature. Walks recent bills newest-first and keeps
// the first (= most recent) rate seen per signature. Stops early once every
// requested signature has been resolved or the page cap is reached.
async function fetchCostPricesFromBills(
  accessToken: string,
  orgId: string,
  signatures: Set<string>,
  invoiceDateEnd: string,
): Promise<Map<string, number>> {
  const costMap = new Map<string, number>()
  if (signatures.size === 0) return costMap

  const remaining = new Set(signatures)
  let page = 1
  const maxPages = 25 // ~5,000 bills lookback cap
  let hasMore = true

  while (hasMore && page <= maxPages && remaining.size > 0) {
    const params = new URLSearchParams({
      organization_id: orgId,
      page: String(page),
      per_page: '200',
      sort_column: 'date',
      sort_order: 'D',
    })
    if (invoiceDateEnd) params.set('date_before', invoiceDateEnd)
    let listData: any
    try {
      const resp = await fetch(`${ZOHO_API_URL}/books/v3/bills?${params.toString()}`, {
        headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
      })
      listData = await resp.json()
      if (!resp.ok || listData.code !== 0) {
        console.error('Zoho bills list error:', listData?.message)
        break
      }
    } catch (e) {
      console.error('Zoho bills fetch error:', e)
      break
    }

    const bills = listData.bills || []
    if (!bills.length) break

    for (let i = 0; i < bills.length && remaining.size > 0; i += 8) {
      const batch = bills.slice(i, i + 8)
      const details = await Promise.all(batch.map(async (b: any) => {
        const id = b.bill_id
        if (!id) return null
        try {
          const r = await fetch(
            `${ZOHO_API_URL}/books/v3/bills/${id}?organization_id=${orgId}`,
            { headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` } },
          )
          const d = await r.json()
          if (!r.ok || d.code !== 0) return null
          return d.bill || null
        } catch { return null }
      }))

      for (const bill of details) {
        if (!bill) continue
        for (const li of bill.line_items || []) {
          // Vendor bill rate is already exclusive of tax in Zoho Books.
          const rate = toNumber(li.rate) ?? toNumber(li.item_rate)
          if (rate === null || rate <= 0) continue

          const sig = lineCostSignature(li)
          if (!sig) continue
          if (remaining.has(sig) && !costMap.has(sig)) {
            costMap.set(sig, rate)
            remaining.delete(sig)
          }
        }
      }
    }

    hasMore = listData.page_context?.has_more_page ?? false
    page++
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
