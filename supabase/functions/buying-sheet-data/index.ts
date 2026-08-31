import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ZOHO_AUTH_URL = 'https://accounts.zoho.com/oauth/v2'
const ZOHO_API_URL = 'https://www.zohoapis.com'
// Statuses that mean a PO can no longer contribute outstanding quantity.
// IMPORTANT: this must NOT be a narrow "which statuses count as open" allow-list -
// Zoho marks a PO 'partially_billed' (not 'open') once any of it has been billed,
// even though it can still have plenty of outstanding quantity left. An allow-list
// of just ['open', 'draft'] silently drops every partially-billed PO, which is why
// "on order" quantities were showing as 0 for items with in-progress purchase orders.
const EXCLUDED_PO_STATUSES = ['cancelled', 'closed', 'rejected', 'draft', 'void', 'billed']
const MAX_RECENT_PO_DETAILS = 100
const MAX_RECENT_BILL_DETAILS = 150

type StockEntry = {
  stockOnHand: number
  itemName: string
  vendorName: string
  purchaseRate: number
}

type BillEntry = {
  vendorName: string
  vendorEmail: string
  unitCost: number | null
  quantity: number
  billDate: string
}


type VendorSummary = {
  vendorName: string
  vendorEmail: string
}

type VendorCandidate = VendorSummary & {
  poDate: string
}

const CACHE_ID = 'buying-sheet'
const SYNC_LOCK_KEY = 'buying-sheet-bootstrap'

async function readCache(supabase: any) {
  const { data } = await supabase
    .from('buying_sheet_cache')
    .select('payload, fetched_at')
    .eq('id', CACHE_ID)
    .maybeSingle()
  return data as { payload: any; fetched_at: string } | null
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
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Normal reads are cache-only. The Zoho webhook updates this shared row and
    // Supabase Realtime pushes the change to every open app. The expensive scan
    // below is now only an explicit admin recovery/bootstrap path.
    let force = false
    if (req.method === 'POST') {
      try {
        const body = await req.json()
        force = body?.force === true
      } catch (_e) { /* no body */ }
    }

    const cached = await readCache(supabase)
    if (!force && cached?.payload) {
      return new Response(JSON.stringify({
        success: true,
        data: cached.payload,
        itemCount: Object.keys(cached.payload || {}).length,
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
        return new Response(JSON.stringify({
          success: true,
          data: cached.payload,
          itemCount: Object.keys(cached.payload || {}).length,
          fetchedAt: cached.fetched_at,
          cached: true,
          syncInProgress: true,
          eventDriven: true,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      return new Response(JSON.stringify({ error: 'Zoho bootstrap sync is already running' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }


    const { skus: activeSkus, nameToSku } = await getActiveBuyingSheetSkus(supabase)
    console.log(`Resolved ${activeSkus.size} active buying sheet SKUs`)

    if (activeSkus.size === 0) {
      return new Response(JSON.stringify({ success: true, data: {}, itemCount: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const accessToken = await getValidAccessToken(supabase, clientId, clientSecret)
    const orgId = await getOrgId(supabase)

    const stockMap = await fetchRelevantItemStock(accessToken, orgId, activeSkus)
    console.log(`Fetched stock for ${stockMap.size} active SKUs from Zoho`)

    const { poQtyMap, poVendorMap } = await fetchOpenPurchaseOrderData(accessToken, orgId, activeSkus)
    console.log(`Fetched open PO quantities for ${poQtyMap.size} active SKUs and open PO vendors for ${poVendorMap.size} active SKUs`)

    // Vendor bills are the source of truth for real purchase cost + who we actually bought from
    const billMap = await fetchVendorBillData(accessToken, orgId, activeSkus, nameToSku)
    console.log(`Resolved vendor-bill cost/supplier for ${billMap.size} active SKUs`)

    const unresolvedAfterBills = new Set(
      [...activeSkus].filter((sku) => !billMap.get(sku)?.vendorName)
    )
    const latestPurchaseOrderVendors = unresolvedAfterBills.size > 0
      ? await fetchLatestPurchaseOrderVendors(accessToken, orgId, unresolvedAfterBills)
      : new Map<string, VendorCandidate>()
    console.log(`Resolved latest Zoho PO suppliers for ${latestPurchaseOrderVendors.size} remaining SKUs`)

    const result: Record<string, {
      stockOnHand: number
      onPurchaseOrder: number
      vendorName: string
      vendorEmail: string
      unitCost: number | null
      lastPurchasedDate: string | null
      lastPurchasedQty: number | null
      costSource: 'bill' | 'item' | null
    }> = {}

    for (const sku of activeSkus) {
      const item = stockMap.get(sku)
      const bill = billMap.get(sku)
      const openPoVendor = poVendorMap.get(sku)
      const latestPoVendor = latestPurchaseOrderVendors.get(sku)

      const unitCost = bill?.unitCost ?? (item?.purchaseRate && item.purchaseRate > 0 ? item.purchaseRate : null)

      result[sku] = {
        stockOnHand: item?.stockOnHand ?? 0,
        onPurchaseOrder: poQtyMap.get(sku) ?? 0,
        // Priority: latest vendor bill > latest PO > open PO > Zoho item vendor
        vendorName: bill?.vendorName || latestPoVendor?.vendorName || openPoVendor?.vendorName || item?.vendorName || '',
        vendorEmail: bill?.vendorEmail || latestPoVendor?.vendorEmail || openPoVendor?.vendorEmail || '',
        unitCost: unitCost !== null ? Math.round(unitCost * 100) / 100 : null,
        lastPurchasedDate: bill?.billDate || null,
        lastPurchasedQty: bill?.quantity ?? null,
        costSource: bill?.unitCost != null ? 'bill' : (unitCost !== null ? 'item' : null),
      }
    }

    const fetchedAt = new Date().toISOString()
    await supabase.from('buying_sheet_cache').upsert({
      id: CACHE_ID,
      payload: result,
      fetched_at: fetchedAt,
    })

    return new Response(JSON.stringify({
      success: true,
      data: result,
      itemCount: activeSkus.size,
      fetchedAt,
      cached: false,
      eventDriven: true,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Buying sheet data error:', error)

    // Zoho quota / transient failure: fall back to the last known good snapshot
    // instead of blanking the page with a 500.
    try {
      const cached = await readCache(supabase)
      if (cached?.payload) {
        return new Response(JSON.stringify({
          success: true,
          data: cached.payload,
          itemCount: Object.keys(cached.payload || {}).length,
          fetchedAt: cached.fetched_at,
          cached: true,
          stale: true,
          warning: error instanceof Error ? error.message : 'Zoho unavailable',
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
    } catch (_e) { /* ignore */ }

    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Failed to fetch Zoho data',
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

async function getActiveBuyingSheetSkus(supabase: any): Promise<{ skus: Set<string>; nameToSku: Map<string, string> }> {
  const { data, error } = await supabase
    .from('order_items')
    .select('code, name, quantity, qty_on_po')
    .eq('progress_stage', 'awaiting-stock')
    .not('code', 'is', null)

  if (error) {
    throw new Error(`Failed to load active buying sheet SKUs: ${error.message}`)
  }

  const skus = new Set<string>()
  const nameToSku = new Map<string, string>()

  for (const row of (data || []) as { code: string | null; name: string | null; quantity: number | null; qty_on_po: number | null }[]) {
    // Skip lines whose full quantity is already covered by a purchase order
    if (Math.max(0, (row.quantity || 0) - (row.qty_on_po || 0)) <= 0) continue
    const sku = normalizeSku(row.code)
    if (!sku) continue
    // M-MISC is a shared placeholder rather than a stock identity. Querying it
    // once and applying that result to every custom line produces false stock,
    // PO and vendor totals, while also wasting Zoho requests.
    if (isSharedMiscSku(sku)) continue
    skus.add(sku)
    const key = normalizeName(row.name)
    if (key && !nameToSku.has(key)) nameToSku.set(key, sku)
  }

  return { skus, nameToSku }
}


async function fetchRelevantItemStock(accessToken: string, orgId: string, activeSkus: Set<string>): Promise<Map<string, StockEntry>> {
  const stockMap = new Map<string, StockEntry>()
  const remainingSkus = new Set(activeSkus)
  let page = 1
  let hasMore = true

  while (hasMore && remainingSkus.size > 0) {
    const data = await fetchZohoPage(
      accessToken,
      `${ZOHO_API_URL}/books/v3/items?organization_id=${orgId}&page=${page}&per_page=200`
    )

    const items = data.items || []
    if (!items.length) {
      hasMore = false
      break
    }

    for (const item of items) {
      const sku = normalizeSku(item.sku || item.item_id)
      if (!sku || !remainingSkus.has(sku)) continue

      stockMap.set(sku, {
        stockOnHand: item.stock_on_hand ?? item.available_stock ?? 0,
        itemName: item.name || item.description || '',
        vendorName: item.vendor_name || item.manufacturer || '',
        purchaseRate: Number(item.purchase_rate ?? 0) || 0,
      })


      remainingSkus.delete(sku)
    }

    hasMore = data.page_context?.has_more_page ?? false
    page++
  }

  return stockMap
}

async function fetchOpenPurchaseOrderData(accessToken: string, orgId: string, activeSkus: Set<string>) {
  const poQtyMap = new Map<string, number>()
  const poVendorMap = new Map<string, VendorCandidate>()

  let page = 1
  let hasMore = true

  while (hasMore) {
    const data = await fetchZohoPage(
      accessToken,
      `${ZOHO_API_URL}/books/v3/purchaseorders?organization_id=${orgId}&page=${page}&per_page=200`
    )

    const purchaseOrders = data.purchaseorders || []
    if (!purchaseOrders.length) {
      hasMore = false
      break
    }

    for (const poSummary of purchaseOrders) {
      const summaryStatus = String(poSummary.status || '').toLowerCase()
      const summaryBilled = String(poSummary.billed_status || '').toLowerCase()
      if (EXCLUDED_PO_STATUSES.includes(summaryStatus)) continue
      if (summaryBilled === 'billed') continue

      const po = await fetchPurchaseOrderDetail(accessToken, orgId, poSummary.purchaseorder_id)
      const status = String(po.status || summaryStatus).toLowerCase()
      const billedStatus = String(po.billed_status || summaryBilled).toLowerCase()
      if (EXCLUDED_PO_STATUSES.includes(status)) continue
      if (billedStatus === 'billed') continue

      const vendorName = po.vendor_name || poSummary.vendor_name || ''
      const vendorEmail = po.vendor_email || poSummary.vendor_email || ''
      const poDate = extractPoDate(po, poSummary)
      const lineItems = Array.isArray(po.line_items) ? po.line_items : []

      for (const lineItem of lineItems) {
        const sku = normalizeSku(lineItem.sku || lineItem.item_id)
        if (!sku || !activeSkus.has(sku)) continue

        // Net off whatever's already been billed/received so a partially-billed
        // PO contributes only its remaining outstanding quantity, not the full
        // original order quantity.
        const quantity = Number(lineItem.quantity || 0)
        const billed = Number(lineItem.quantity_billed ?? 0)
        const outstanding = Math.max(0, quantity - billed)
        if (outstanding <= 0) continue

        poQtyMap.set(sku, (poQtyMap.get(sku) || 0) + outstanding)

        if (vendorName) {
          upsertLatestVendor(poVendorMap, sku, { vendorName, vendorEmail, poDate })
        }
      }
    }

    hasMore = data.page_context?.has_more_page ?? false
    page++
  }

  return { poQtyMap, poVendorMap }
}

/**
 * Scan recent vendor bills (newest first) to find, per active SKU, the real
 * purchase cost and the vendor we actually bought from. Bill lines without a
 * SKU are matched by item name/description against the awaiting-stock items.
 */
async function fetchVendorBillData(
  accessToken: string,
  orgId: string,
  activeSkus: Set<string>,
  nameToSku: Map<string, string>,
): Promise<Map<string, BillEntry>> {
  const billMap = new Map<string, BillEntry>()
  const unresolved = new Set(activeSkus)
  let page = 1
  let hasMore = true
  let inspected = 0

  while (hasMore && unresolved.size > 0 && inspected < MAX_RECENT_BILL_DETAILS) {
    const data = await fetchZohoPage(
      accessToken,
      `${ZOHO_API_URL}/books/v3/bills?organization_id=${orgId}&page=${page}&per_page=200&sort_column=date&sort_order=D`
    )

    const bills = data.bills || []
    if (!bills.length) break

    for (const summary of bills) {
      if (inspected >= MAX_RECENT_BILL_DETAILS || unresolved.size === 0) break
      if (String(summary.status || '').toLowerCase() === 'void') continue

      const detail = await fetchBillDetail(accessToken, orgId, summary.bill_id)
      inspected++

      const vendorName = detail.vendor_name || summary.vendor_name || ''
      const vendorEmail = detail.vendor_email || summary.vendor_email || ''
      const billDate = String(detail.date || summary.date || detail.last_modified_time || '')
      const lineItems = Array.isArray(detail.line_items) ? detail.line_items : []

      for (const line of lineItems) {
        let sku = normalizeSku(line.sku)
        if (!sku || !unresolved.has(sku)) {
          const byName = nameToSku.get(normalizeName(line.name)) || nameToSku.get(normalizeName(line.description))
          if (byName && unresolved.has(byName)) sku = byName
          else continue
        }

        const qty = Number(line.quantity || 0)
        const rate = Number(line.rate ?? 0)
        const total = Number(line.item_total ?? 0)
        const unitCost = rate > 0 ? rate : (qty > 0 && total > 0 ? total / qty : null)

        billMap.set(sku, { vendorName, vendorEmail, unitCost, quantity: qty, billDate })
        unresolved.delete(sku)
      }
    }

    hasMore = data.page_context?.has_more_page ?? false
    page++
  }

  console.log(`Inspected ${inspected} vendor bills; ${unresolved.size} active SKUs have no bill history`)
  return billMap
}

async function fetchBillDetail(accessToken: string, orgId: string, billId: string) {
  const data = await fetchZohoPage(
    accessToken,
    `${ZOHO_API_URL}/books/v3/bills/${billId}?organization_id=${orgId}`
  )
  return data.bill || {}
}

async function fetchLatestPurchaseOrderVendors(accessToken: string, orgId: string, activeSkus: Set<string>) {

  const latestVendorMap = new Map<string, VendorCandidate>()
  const unresolvedSkus = new Set(activeSkus)
  let page = 1
  let hasMore = true
  let inspectedDetails = 0

  while (hasMore && unresolvedSkus.size > 0 && inspectedDetails < MAX_RECENT_PO_DETAILS) {
    const data = await fetchZohoPage(
      accessToken,
      `${ZOHO_API_URL}/books/v3/purchaseorders?organization_id=${orgId}&page=${page}&per_page=200`
    )

    const purchaseOrders = data.purchaseorders || []
    if (!purchaseOrders.length) {
      hasMore = false
      break
    }

    for (const poSummary of purchaseOrders) {
      if (inspectedDetails >= MAX_RECENT_PO_DETAILS || unresolvedSkus.size === 0) break
      if (String(poSummary.status || '').toLowerCase() === 'cancelled') continue

      const po = await fetchPurchaseOrderDetail(accessToken, orgId, poSummary.purchaseorder_id)
      inspectedDetails++

      const vendorName = po.vendor_name || poSummary.vendor_name || ''
      if (!vendorName) continue

      const vendorEmail = po.vendor_email || poSummary.vendor_email || ''
      const poDate = extractPoDate(po, poSummary)
      const lineItems = Array.isArray(po.line_items) ? po.line_items : []

      for (const lineItem of lineItems) {
        const sku = normalizeSku(lineItem.sku || lineItem.item_id)
        if (!sku || !unresolvedSkus.has(sku)) continue

        latestVendorMap.set(sku, { vendorName, vendorEmail, poDate })
        unresolvedSkus.delete(sku)
      }
    }

    hasMore = data.page_context?.has_more_page ?? false
    page++
  }

  console.log(`Inspected ${inspectedDetails} recent Zoho purchase orders and resolved latest suppliers for ${latestVendorMap.size} active SKUs`)
  if (unresolvedSkus.size > 0) {
    console.log(`${unresolvedSkus.size} active SKUs still have no recent Zoho purchase-order supplier match`)
  }

  return latestVendorMap
}

function upsertLatestVendor(map: Map<string, VendorCandidate>, sku: string, candidate: VendorCandidate) {
  const existing = map.get(sku)
  if (!existing || candidate.poDate >= existing.poDate) {
    map.set(sku, candidate)
  }
}

async function fetchPurchaseOrderDetail(accessToken: string, orgId: string, purchaseOrderId: string) {
  const data = await fetchZohoPage(
    accessToken,
    `${ZOHO_API_URL}/books/v3/purchaseorders/${purchaseOrderId}?organization_id=${orgId}`
  )

  return data.purchaseorder || {}
}

function extractPoDate(po: any, poSummary: any): string {
  return String(
    po.date ||
    po.purchaseorder_date ||
    po.last_modified_time ||
    po.updated_time ||
    po.created_time ||
    poSummary?.date ||
    poSummary?.purchaseorder_date ||
    poSummary?.last_modified_time ||
    poSummary?.updated_time ||
    poSummary?.created_time ||
    ''
  )
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

    const message = data.message || `Zoho request failed for ${url}`
    lastError = new Error(message)

    // Zoho caps concurrent API requests — back off and retry instead of failing the page
    if (resp.status === 429 || isZohoThrottle(message)) {
      await sleep(700 * Math.pow(2, attempt))
      continue
    }

    throw lastError
  }

  throw lastError ?? new Error(`Zoho request failed for ${url}`)
}

function normalizeSku(value: unknown): string {
  return String(value || '').trim().toUpperCase()
}

function isSharedMiscSku(value: unknown): boolean {
  const sku = normalizeSku(value).replace(/\s+/g, '-')
  return sku === 'M-MISCELLANEOUS' || sku === 'M-MISC' || sku === 'MISCELLANEOUS' || sku === 'MISC'
}

function normalizeName(value: unknown): string {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ')
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
