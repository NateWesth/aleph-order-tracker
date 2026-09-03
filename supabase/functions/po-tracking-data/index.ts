import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ZOHO_AUTH_URL = 'https://accounts.zoho.com/oauth/v2'
const ZOHO_API_URL = 'https://www.zohoapis.com'

// Financial billing and physical receipt are different workflows. A PO can be
// fully billed while the cartons are still waiting at the supplier.
const EXCLUDED_PO_STATUSES = ['cancelled', 'closed', 'rejected', 'draft', 'void']
const COLLECTION_RETENTION_DAYS = 21
const MAX_PO_SUMMARIES = 1000
const DETAIL_CONCURRENCY = 8
const EXCLUDED_RECEIVED_STATUSES = ['received', 'fully_received']
const CACHE_ID = '00000000-0000-0000-0000-000000000003'
const SYNC_LOCK_KEY = 'po-tracking-bootstrap'

type POLine = {
  sku: string
  name: string
  description: string
  quantity: number
  quantityReceived: number
  quantityBilled: number
  outstanding: number
  rate: number
}

type POEntry = {
  purchaseOrderId: string
  purchaseOrderNumber: string
  vendorId: string
  vendorName: string
  vendorEmail: string
  date: string
  expectedDeliveryDate: string | null
  status: string
  receivedStatus: string
  billedStatus: string
  total: number
  outstandingValue: number
  lines: POLine[]
  sourceModifiedAt?: string
}

function sourceModifiedAt(record: any): string {
  return String(record?.last_modified_time || record?.updated_time || record?.modified_time || '')
}

function sourceLineDescription(line: any): string {
  return String(line?.description || line?.item_description || line?.item_details || line?.notes || '').trim()
}

function cachedLineDescriptionsAreComplete(entry: POEntry): boolean {
  return Array.isArray(entry.lines) && entry.lines.every((line) => {
    const sku = String(line.sku || '').trim().toLowerCase()
    const generic = sku.startsWith('m-misc') || sku === 'misc' || sku === 'miscellaneous'
    return !generic || Boolean(String(line.description || '').trim())
  })
}

function isExcludedSku(sku: string): boolean {
  const s = (sku || '').trim().toUpperCase()
  return s.startsWith('SH-') || s.startsWith('ZSH')
}

function collectionCutoffMs(): number {
  const cutoff = new Date()
  cutoff.setUTCHours(0, 0, 0, 0)
  cutoff.setUTCDate(cutoff.getUTCDate() - COLLECTION_RETENTION_DAYS)
  return cutoff.getTime()
}

function isWithinCollectionRetention(date: unknown): boolean {
  const timestamp = new Date(String(date || '')).getTime()
  return Number.isFinite(timestamp) && timestamp >= collectionCutoffMs()
}

function currentPurchaseOrders(entries: POEntry[]): POEntry[] {
  return entries.filter((entry) => isWithinCollectionRetention(entry.date))
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
  let recoveryLockAcquired = false

  if (!clientId || !clientSecret) {
    const { data: cached } = await supabase
      .from('po_tracking_cache')
      .select('payload, fetched_at')
      .eq('id', CACHE_ID)
      .maybeSingle()

    if (cached?.payload) {
      const purchaseOrders = currentPurchaseOrders(cached.payload as POEntry[])
      return new Response(JSON.stringify({
        success: true,
        purchaseOrders,
        count: purchaseOrders.length,
        fetchedAt: cached.fetched_at,
        cached: true,
        stale: true,
        warning: 'Zoho credentials are not configured; showing cached data',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

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

    let force = false
    let refresh = false
    if (req.method === 'POST') {
      try {
        const body = await req.json()
        force = body?.force === true
        refresh = body?.refresh === true
      } catch (_e) { /* no body */ }
    }

    const { data: cached } = await supabase
      .from('po_tracking_cache')
      .select('payload, fetched_at')
      .eq('id', CACHE_ID)
      .maybeSingle()

    // Normal app reads remain cache-first. Fulfillment may request a throttled
    // source refresh so a missed/delayed webhook cannot hide a brand-new PO.
    // Webhooks are primary. A roomy recovery cache prevents multiple users from
    // spending the same Zoho calls when they open this workspace together.
    const cacheAgeMs = cached?.fetched_at ? Date.now() - new Date(cached.fetched_at).getTime() : Number.POSITIVE_INFINITY
    const cacheIsFresh = Number.isFinite(cacheAgeMs) && cacheAgeMs < 10 * 60_000
    if (!force && cached?.payload && (!refresh || cacheIsFresh)) {
      const purchaseOrders = currentPurchaseOrders(cached.payload as POEntry[])
      return new Response(JSON.stringify({
        success: true,
        purchaseOrders,
        count: purchaseOrders.length,
        fetchedAt: cached.fetched_at,
        cached: true,
        eventDriven: true,
        fresh: cacheIsFresh,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (force) {
      const { data: role } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle()
      if (role?.role !== 'admin') {
        return new Response(JSON.stringify({ error: 'Only administrators can run a full Zoho recovery sync' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    const { data: acquired } = await supabase.rpc('try_acquire_zoho_sync_lock', {
      requested_key: SYNC_LOCK_KEY,
      lease_seconds: 600,
    })
    recoveryLockAcquired = acquired === true
    if (!recoveryLockAcquired) {
      if (cached?.payload) {
        const purchaseOrders = currentPurchaseOrders(cached.payload as POEntry[])
        return new Response(JSON.stringify({
          success: true,
          purchaseOrders,
          count: purchaseOrders.length,
          fetchedAt: cached.fetched_at,
          cached: true,
          syncInProgress: true,
          eventDriven: true,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      return new Response(JSON.stringify({ error: 'PO tracking bootstrap sync is already running' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const [accessToken, orgId] = await Promise.all([
      getValidAccessToken(supabase, clientId, clientSecret),
      getOrgId(supabase),
    ])

    const purchaseOrders = await fetchOutstandingPurchaseOrders(
      accessToken,
      orgId,
      Array.isArray(cached?.payload) ? cached.payload as POEntry[] : [],
    )
    const fetchedAt = new Date().toISOString()

    await supabase.from('po_tracking_cache').upsert({
      id: CACHE_ID,
      payload: purchaseOrders,
      fetched_at: fetchedAt,
    })

    return new Response(JSON.stringify({
      success: true,
      purchaseOrders,
      count: purchaseOrders.length,
      fetchedAt,
      cached: false,
      eventDriven: true,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('PO tracking data error:', error)
    const { data: cached } = await supabase
      .from('po_tracking_cache')
      .select('payload, fetched_at')
      .eq('id', CACHE_ID)
      .maybeSingle()

    if (cached?.payload) {
      const purchaseOrders = currentPurchaseOrders(cached.payload as POEntry[])
      return new Response(JSON.stringify({
        success: true,
        purchaseOrders,
        count: purchaseOrders.length,
        fetchedAt: cached.fetched_at,
        cached: true,
        stale: true,
        warning: error instanceof Error ? error.message : 'Zoho refresh failed',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Failed to fetch Zoho purchase orders',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } finally {
    if (recoveryLockAcquired) {
      await supabase.rpc('release_zoho_sync_lock', { requested_key: SYNC_LOCK_KEY })
    }
  }
})

async function fetchOutstandingPurchaseOrders(accessToken: string, orgId: string, cachedEntries: POEntry[]): Promise<POEntry[]> {
  // Zoho sorts newest first, so stop as soon as the rolling three-week window
  // ends. This both enforces the operational rule and avoids historic API reads.
  const candidates: any[] = []
  let inspectedSummaries = 0
  let page = 1
  let hasMore = true
  let reachedRetentionCutoff = false
  while (hasMore && inspectedSummaries < MAX_PO_SUMMARIES) {
    const data = await fetchZohoPage(
      accessToken,
      `${ZOHO_API_URL}/books/v3/purchaseorders?organization_id=${orgId}&page=${page}&per_page=200&sort_column=date&sort_order=D`
    )

    const summaries = data.purchaseorders || []
    if (!summaries.length) break

    for (const summary of summaries) {
      inspectedSummaries++
      if (inspectedSummaries > MAX_PO_SUMMARIES) break

      const summaryDate = summary.date || summary.purchaseorder_date
      if (!isWithinCollectionRetention(summaryDate)) {
        if (Number.isFinite(new Date(String(summaryDate || '')).getTime())) reachedRetentionCutoff = true
        continue
      }

      const status = String(summary.status || '').trim().toLowerCase()
      const billedStatus = String(summary.billed_status || '').trim().toLowerCase()
      const receivedStatus = String(summary.received_status || '').trim().toLowerCase()
      if (EXCLUDED_PO_STATUSES.includes(status)) continue
      if (EXCLUDED_RECEIVED_STATUSES.includes(receivedStatus)) continue
      candidates.push(summary)
    }

    hasMore = !reachedRetentionCutoff && (data.page_context?.has_more_page ?? false)
    page++
  }


  const cachedById = new Map(cachedEntries.map((entry) => [entry.purchaseOrderId, entry]))

  // Reuse unchanged details. A recovery sync therefore costs list pages plus
  // detail calls only for records whose Zoho modified timestamp changed.
  const results: POEntry[] = []
  for (let i = 0; i < candidates.length; i += DETAIL_CONCURRENCY) {
    const batch = candidates.slice(i, i + DETAIL_CONCURRENCY)
    const details = await Promise.all(
      batch.map(async (summary) => {
        const id = String(summary.purchaseorder_id || '')
        const cached = cachedById.get(id)
        const modifiedAt = sourceModifiedAt(summary)
        if (cached && modifiedAt && cached.sourceModifiedAt === modifiedAt && cachedLineDescriptionsAreComplete(cached)) {
          return { summary, cached }
        }
        try {
          return { summary, po: await fetchPurchaseOrderDetail(accessToken, orgId, id) }
        } catch (e) {
          console.error(`Failed to fetch PO ${summary.purchaseorder_id}:`, e)
          return cached ? { summary, cached } : null
        }
      })
    )

    for (const entry of details) {
      if (!entry) continue
      const { summary } = entry
      if ('cached' in entry && entry.cached) {
        results.push({ ...entry.cached, sourceModifiedAt: sourceModifiedAt(summary) || entry.cached.sourceModifiedAt })
        continue
      }
      const po = entry.po
      const status = String(po.status || summary.status || '').trim().toLowerCase()
      const detailBilled = String(po.billed_status || summary.billed_status || '').trim().toLowerCase()
      const detailReceived = String(po.received_status || summary.received_status || '').trim().toLowerCase()
      if (EXCLUDED_PO_STATUSES.includes(status)) continue
      if (EXCLUDED_RECEIVED_STATUSES.includes(detailReceived)) continue

      const rawLines = Array.isArray(po.line_items) ? po.line_items : []
      const lines: POLine[] = []

      for (const line of rawLines) {
        const sku = String(line.sku || '').trim()
        if (isExcludedSku(sku)) continue

        const quantity = Number(line.quantity || 0)
        const quantityReceived = Number(line.quantity_received ?? 0)
        const zohoBilled = Number(line.quantity_billed ?? 0)
        const quantityBilled = zohoBilled
        // Collection is a physical-stock workflow. Only received quantities
        // close it; bill detail is intentionally not fetched, reducing Zoho API
        // calls and preventing prepaid/unreceived stock from disappearing.
        const outstanding = Math.max(0, quantity - quantityReceived)
        // Fully received line -> not outstanding
        if (outstanding <= 0) continue

        lines.push({
          sku,
          name: String(line.name || ''),
          description: sourceLineDescription(line),
          quantity,
          quantityReceived,
          quantityBilled,
          outstanding,
          rate: Number(line.rate ?? 0),
        })
      }


      if (lines.length === 0) continue

      const outstandingValue = lines.reduce((sum, l) => sum + l.outstanding * l.rate, 0)

      results.push({
        purchaseOrderId: String(po.purchaseorder_id || summary.purchaseorder_id),
        purchaseOrderNumber: String(po.purchaseorder_number || summary.purchaseorder_number || ''),
        vendorId: String(po.vendor_id || summary.vendor_id || ''),
        vendorName: String(po.vendor_name || summary.vendor_name || 'Unknown supplier'),
        vendorEmail: String(po.vendor_email || summary.vendor_email || ''),
        date: String(po.date || summary.date || ''),
        expectedDeliveryDate: po.delivery_date || summary.delivery_date || null,
        status,
        receivedStatus: String(po.received_status || summary.received_status || ''),
        billedStatus: detailBilled,
        total: Number(po.total ?? summary.total ?? 0),
        outstandingValue: Math.round(outstandingValue * 100) / 100,
        lines,
        sourceModifiedAt: sourceModifiedAt(po) || sourceModifiedAt(summary),
      })
    }
  }

  console.log(`Inspected ${inspectedSummaries} PO summaries, ${candidates.length} active candidates, ${results.length} still outstanding`)
  return results
}

async function fetchPurchaseOrderDetail(accessToken: string, orgId: string, purchaseOrderId: string) {
  const data = await fetchZohoPage(
    accessToken,
    `${ZOHO_API_URL}/books/v3/purchaseorders/${purchaseOrderId}?organization_id=${orgId}`
  )
  return data.purchaseorder || {}
}

function lineKey(sku: unknown, name: unknown, description: unknown): string {
  const s = String(sku || '').trim().toLowerCase()
  const n = String(name || '').trim().toLowerCase()
  const d = String(description || '').trim().toLowerCase()
  if (s) return `sku:${s}|item:${d || n}`
  return `nm:${n}|${d}`
}

// Sum quantities already covered by vendor bills linked to this PO
async function fetchBilledQuantities(
  accessToken: string,
  orgId: string,
  po: any,
  cache: Map<string, any>
): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  const bills = Array.isArray(po.bills) ? po.bills : []
  if (!bills.length) return map

  // Fetch every linked bill for this PO in parallel instead of one at a time -
  // POs with several bills were previously adding a full serial round trip per
  // bill on top of an already-limited detail concurrency, which was the main
  // reason the page took so long to load.
  const fetched = await Promise.all(
    bills.map(async (b: any) => {
      const billId = String(b.bill_id || '')
      if (!billId) return null
      try {
        let bill = cache.get(billId)
        if (!bill) {
          const data = await fetchZohoPage(
            accessToken,
            `${ZOHO_API_URL}/books/v3/bills/${billId}?organization_id=${orgId}`
          )
          bill = data.bill || {}
          cache.set(billId, bill)
        }
        return bill
      } catch (e) {
        console.error(`Failed to fetch bill ${billId}:`, e)
        return null
      }
    })
  )

  for (const bill of fetched) {
    if (!bill) continue
    const status = String(bill.status || '').toLowerCase()
    if (status === 'void' || status === 'cancelled') continue
    for (const bl of bill.line_items || []) {
      const key = lineKey(bl.sku, bl.name, bl.description)
      map.set(key, (map.get(key) ?? 0) + Number(bl.quantity || 0))
    }
  }

  return map
}




const ZOHO_RETRY_ATTEMPTS = 4

function isZohoThrottle(message: string): boolean {
  const m = (message || '').toLowerCase()
  return m.includes('maximum number of in process requests') || m.includes('too many requests') || m.includes('rate limit')
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function fetchZohoPage(accessToken: string, url: string) {
  let lastError: Error | null = null

  for (let attempt = 0; attempt < ZOHO_RETRY_ATTEMPTS; attempt++) {
    const resp = await fetch(url, {
      headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
    })

    const data = await resp.json()
    if (resp.ok && data.code === 0) return data

    const message = data.message || 'unknown error'
    lastError = new Error(`Zoho API error (${resp.status}): ${message}`)

    if (resp.status === 429 || isZohoThrottle(message)) {
      await sleep(700 * Math.pow(2, attempt))
      continue
    }

    throw lastError
  }

  throw lastError ?? new Error(`Zoho request failed for ${url}`)
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
