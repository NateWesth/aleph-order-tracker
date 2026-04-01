import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ZOHO_AUTH_URL = 'https://accounts.zoho.com/oauth/v2'
const ZOHO_API_URL = 'https://www.zohoapis.com'
const OPEN_PO_STATUSES = ['open', 'draft']
const MAX_RECENT_PO_DETAILS = 100

type StockEntry = {
  stockOnHand: number
  itemName: string
  vendorName: string
}

type VendorSummary = {
  vendorName: string
  vendorEmail: string
}

type VendorCandidate = VendorSummary & {
  poDate: string
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

    const activeSkus = await getActiveBuyingSheetSkus(supabase)
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

    const latestPurchaseOrderVendors = await fetchLatestPurchaseOrderVendors(accessToken, orgId, activeSkus)
    console.log(`Resolved latest Zoho PO suppliers for ${latestPurchaseOrderVendors.size} active SKUs`)

    const result: Record<string, { stockOnHand: number; onPurchaseOrder: number; vendorName: string; vendorEmail: string }> = {}

    for (const sku of activeSkus) {
      const itemVendor = stockMap.get(sku)?.vendorName ?? ''
      const openPoVendor = poVendorMap.get(sku)
      const latestPoVendor = latestPurchaseOrderVendors.get(sku)

      result[sku] = {
        stockOnHand: stockMap.get(sku)?.stockOnHand ?? 0,
        onPurchaseOrder: poQtyMap.get(sku) ?? 0,
        vendorName: latestPoVendor?.vendorName || openPoVendor?.vendorName || itemVendor || '',
        vendorEmail: latestPoVendor?.vendorEmail || openPoVendor?.vendorEmail || '',
      }
    }

    return new Response(JSON.stringify({
      success: true,
      data: result,
      itemCount: activeSkus.size,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Buying sheet data error:', error)
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Failed to fetch Zoho data',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

async function getActiveBuyingSheetSkus(supabase: any): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('order_items')
    .select('code')
    .eq('progress_stage', 'awaiting-stock')
    .not('code', 'is', null)

  if (error) {
    throw new Error(`Failed to load active buying sheet SKUs: ${error.message}`)
  }

  return new Set(
    (data || [])
      .map((row: { code: string | null }) => normalizeSku(row.code))
      .filter(Boolean)
  )
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

  for (const status of OPEN_PO_STATUSES) {
    let page = 1
    let hasMore = true

    while (hasMore) {
      const data = await fetchZohoPage(
        accessToken,
        `${ZOHO_API_URL}/books/v3/purchaseorders?organization_id=${orgId}&status=${status}&page=${page}&per_page=200`
      )

      const purchaseOrders = data.purchaseorders || []
      if (!purchaseOrders.length) {
        hasMore = false
        break
      }

      for (const poSummary of purchaseOrders) {
        const po = await fetchPurchaseOrderDetail(accessToken, orgId, poSummary.purchaseorder_id)
        const vendorName = po.vendor_name || poSummary.vendor_name || ''
        const vendorEmail = po.vendor_email || poSummary.vendor_email || ''
        const poDate = extractPoDate(po, poSummary)
        const lineItems = Array.isArray(po.line_items) ? po.line_items : []

        for (const lineItem of lineItems) {
          const sku = normalizeSku(lineItem.sku || lineItem.item_id)
          if (!sku || !activeSkus.has(sku)) continue

          poQtyMap.set(sku, (poQtyMap.get(sku) || 0) + Number(lineItem.quantity || 0))

          if (vendorName) {
            upsertLatestVendor(poVendorMap, sku, { vendorName, vendorEmail, poDate })
          }
        }
      }

      hasMore = data.page_context?.has_more_page ?? false
      page++
    }
  }

  return { poQtyMap, poVendorMap }
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

async function fetchZohoPage(accessToken: string, url: string) {
  const resp = await fetch(url, {
    headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
  })

  const data = await resp.json()
  if (!resp.ok || data.code !== 0) {
    throw new Error(data.message || `Zoho request failed for ${url}`)
  }

  return data
}

function normalizeSku(value: unknown): string {
  return String(value || '').trim().toUpperCase()
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
