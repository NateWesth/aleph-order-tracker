import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ZOHO_AUTH_URL = 'https://accounts.zoho.com/oauth/v2'
const ZOHO_API_URL = 'https://www.zohoapis.com'

// Statuses we consider "still outstanding" (fully billed / cancelled / closed / draft drop off)
const EXCLUDED_PO_STATUSES = ['cancelled', 'closed', 'rejected', 'draft', 'void', 'billed']
// Ignore anything older than this - stale POs are effectively dead
const MAX_PO_AGE_DAYS = 180
const MAX_PO_DETAILS = 250
const DETAIL_CONCURRENCY = 8
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
}

function isExcludedSku(sku: string): boolean {
  const s = (sku || '').trim().toUpperCase()
  return s.startsWith('SH-') || s.startsWith('ZSH')
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
      const purchaseOrders = cached.payload as POEntry[]
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
    if (req.method === 'POST') {
      try {
        const body = await req.json()
        force = body?.force === true
      } catch (_e) { /* no body */ }
    }

    const { data: cached } = await supabase
      .from('po_tracking_cache')
      .select('payload, fetched_at')
      .eq('id', CACHE_ID)
      .maybeSingle()

    // Event-driven mode: normal page loads never contact Zoho. A webhook reads
    // the changed PO once, updates this cache row, and Realtime fans it out.
    if (!force && cached?.payload) {
      const purchaseOrders = cached.payload as POEntry[]
      return new Response(JSON.stringify({
        success: true,
        purchaseOrders,
        count: purchaseOrders.length,
        fetchedAt: cached.fetched_at,
        cached: true,
        eventDriven: true,
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
        const purchaseOrders = cached.payload as POEntry[]
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

    const purchaseOrders = await fetchOutstandingPurchaseOrders(accessToken, orgId)
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
      const purchaseOrders = cached.payload as POEntry[]
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

async function fetchOutstandingPurchaseOrders(accessToken: string, orgId: string): Promise<POEntry[]> {
  // 1. Page through the lightweight list endpoint and pre-filter candidates
  const candidates: any[] = []
  let page = 1
  let hasMore = true
  let reachedCutoff = false
  const cutoff = new Date(Date.now() - MAX_PO_AGE_DAYS * 24 * 60 * 60 * 1000)

  while (hasMore && !reachedCutoff && candidates.length < MAX_PO_DETAILS) {
    const data = await fetchZohoPage(
      accessToken,
      `${ZOHO_API_URL}/books/v3/purchaseorders?organization_id=${orgId}&page=${page}&per_page=200&sort_column=date&sort_order=D`
    )

    const summaries = data.purchaseorders || []
    if (!summaries.length) break

    for (const summary of summaries) {
      if (candidates.length >= MAX_PO_DETAILS) break

      // list is sorted newest-first, so once we cross the cutoff we can stop entirely
      const poDate = summary.date ? new Date(summary.date) : null
      if (poDate && !isNaN(poDate.getTime()) && poDate < cutoff) {
        reachedCutoff = true
        break
      }

      const status = String(summary.status || '').trim().toLowerCase()
      const billedStatus = String(summary.billed_status || '').trim().toLowerCase()
      if (EXCLUDED_PO_STATUSES.includes(status)) continue
      if (billedStatus === 'billed' || billedStatus === 'fully_billed') continue
      candidates.push(summary)
    }

    hasMore = data.page_context?.has_more_page ?? false
    page++
  }


  // 2. Fetch detail records in parallel batches instead of one-by-one
  const results: POEntry[] = []
  const billCache = new Map<string, any>()

  for (let i = 0; i < candidates.length; i += DETAIL_CONCURRENCY) {
    const batch = candidates.slice(i, i + DETAIL_CONCURRENCY)
    const details = await Promise.all(
      batch.map(async (summary) => {
        try {
          return { summary, po: await fetchPurchaseOrderDetail(accessToken, orgId, summary.purchaseorder_id) }
        } catch (e) {
          console.error(`Failed to fetch PO ${summary.purchaseorder_id}:`, e)
          return null
        }
      })
    )

    for (const entry of details) {
      if (!entry) continue
      const { summary, po } = entry
      const status = String(po.status || summary.status || '').trim().toLowerCase()
      const detailBilled = String(po.billed_status || summary.billed_status || '').trim().toLowerCase()
      if (EXCLUDED_PO_STATUSES.includes(status)) continue
      if (detailBilled === 'billed' || detailBilled === 'fully_billed') continue

      const rawLines = Array.isArray(po.line_items) ? po.line_items : []
      const lines: POLine[] = []

      // Zoho doesn't always populate quantity_billed on PO lines, so reconcile
      // against the actual vendor bills linked to this PO.
      const billedMap = await fetchBilledQuantities(accessToken, orgId, po, billCache)

      for (const line of rawLines) {
        const sku = String(line.sku || '').trim()
        if (isExcludedSku(sku)) continue

        const quantity = Number(line.quantity || 0)
        const quantityReceived = Number(line.quantity_received ?? 0)
        const zohoBilled = Number(line.quantity_billed ?? 0)
        const billBilled = billedMap.get(lineKey(sku, line.name, line.description)) ?? 0
        const quantityBilled = Math.max(zohoBilled, billBilled)
        const outstanding = Math.max(0, quantity - Math.max(quantityBilled, 0))
        // Item already has a vendor bill covering it -> not outstanding
        if (outstanding <= 0) continue

        lines.push({
          sku,
          name: String(line.name || ''),
          description: String(line.description || ''),
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
      })
    }
  }

  console.log(`Inspected ${candidates.length} purchase orders, ${results.length} still outstanding`)
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
  if (s) return `sku:${s}`
  return `nm:${String(name || '').trim().toLowerCase()}|${String(description || '').trim().toLowerCase()}`
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
