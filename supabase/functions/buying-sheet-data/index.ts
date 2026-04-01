import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ZOHO_AUTH_URL = 'https://accounts.zoho.com/oauth/v2'
const ZOHO_API_URL = 'https://www.zohoapis.com'

type StockEntry = {
  stockOnHand: number
  itemName: string
  vendorName: string
}

type VendorSummary = {
  vendorName: string
  vendorEmail: string
}

type VendorStat = VendorSummary & {
  count: number
  totalQty: number
  latestDate: string
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

    const historicalVendorMap = await fetchHistoricalVendorData(accessToken, orgId, activeSkus)
    console.log(`Fetched historical vendor suggestions for ${historicalVendorMap.size} active SKUs from Zoho`)

    const result: Record<string, { stockOnHand: number; onPurchaseOrder: number; vendorName: string; vendorEmail: string }> = {}

    for (const sku of activeSkus) {
      const itemVendor = stockMap.get(sku)?.vendorName ?? ''
      const openPoVendor = poVendorMap.get(sku)
      const historicalVendor = getBestHistoricalVendor(historicalVendorMap, sku)

      result[sku] = {
        stockOnHand: stockMap.get(sku)?.stockOnHand ?? 0,
        onPurchaseOrder: poQtyMap.get(sku) ?? 0,
        vendorName: historicalVendor?.vendorName || openPoVendor?.vendorName || itemVendor || '',
        vendorEmail: historicalVendor?.vendorEmail || openPoVendor?.vendorEmail || '',
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
  let page = 1
  let hasMore = true

  while (hasMore) {
    const data = await fetchZohoPage(accessToken, `${ZOHO_API_URL}/books/v3/items?organization_id=${orgId}&page=${page}&per_page=200`)

    if (!data.items?.length) {
      hasMore = false
      break
    }

    for (const item of data.items) {
      const sku = normalizeSku(item.sku || item.item_id)
      if (!sku || !activeSkus.has(sku)) continue

      stockMap.set(sku, {
        stockOnHand: item.stock_on_hand ?? item.available_stock ?? 0,
        itemName: item.name || item.description || '',
        vendorName: item.vendor_name || item.manufacturer || '',
      })
    }

    hasMore = data.page_context?.has_more_page ?? false
    page++
  }

  return stockMap
}

async function fetchOpenPurchaseOrderData(accessToken: string, orgId: string, activeSkus: Set<string>) {
  const poQtyMap = new Map<string, number>()
  const poVendorMap = new Map<string, VendorSummary>()

  await forEachPurchaseOrder(accessToken, orgId, ['open', 'draft'], (po) => {
    const vendorName = po.vendor_name || ''
    const vendorEmail = po.vendor_email || ''
    const lineItems = Array.isArray(po.line_items) ? po.line_items : []

    for (const lineItem of lineItems) {
      const sku = normalizeSku(lineItem.sku || lineItem.item_id)
      if (!sku || !activeSkus.has(sku)) continue

      poQtyMap.set(sku, (poQtyMap.get(sku) || 0) + Number(lineItem.quantity || 0))

      if (vendorName && !poVendorMap.has(sku)) {
        poVendorMap.set(sku, { vendorName, vendorEmail })
      }
    }
  })

  return { poQtyMap, poVendorMap }
}

async function fetchHistoricalVendorData(accessToken: string, orgId: string, activeSkus: Set<string>) {
  const historicalVendorMap = new Map<string, Map<string, VendorStat>>()

  await forEachPurchaseOrder(accessToken, orgId, ['closed', 'billed'], (po) => {
    const vendorName = po.vendor_name || ''
    const vendorEmail = po.vendor_email || ''
    const vendorKey = String(po.vendor_id || vendorName).toLowerCase()
    const poDate = String(po.date || po.purchaseorder_date || po.created_time || '')
    const lineItems = Array.isArray(po.line_items) ? po.line_items : []

    if (!vendorName || lineItems.length === 0) return

    for (const lineItem of lineItems) {
      const sku = normalizeSku(lineItem.sku || lineItem.item_id)
      if (!sku || !activeSkus.has(sku)) continue

      if (!historicalVendorMap.has(sku)) {
        historicalVendorMap.set(sku, new Map())
      }

      const skuVendors = historicalVendorMap.get(sku)!
      const existing = skuVendors.get(vendorKey) || {
        vendorName,
        vendorEmail,
        count: 0,
        totalQty: 0,
        latestDate: poDate,
      }

      existing.count += 1
      existing.totalQty += Number(lineItem.quantity || 0)
      if (poDate && poDate > existing.latestDate) {
        existing.latestDate = poDate
      }
      if (vendorEmail) {
        existing.vendorEmail = vendorEmail
      }
      if (vendorName) {
        existing.vendorName = vendorName
      }

      skuVendors.set(vendorKey, existing)
    }
  })

  return historicalVendorMap
}

function getBestHistoricalVendor(
  historicalVendorMap: Map<string, Map<string, VendorStat>>,
  sku: string
): VendorSummary | null {
  const vendors = historicalVendorMap.get(sku)
  if (!vendors || vendors.size === 0) return null

  let best: VendorStat | null = null

  for (const stats of vendors.values()) {
    if (
      !best ||
      stats.totalQty > best.totalQty ||
      (stats.totalQty === best.totalQty && stats.count > best.count) ||
      (stats.totalQty === best.totalQty && stats.count === best.count && stats.latestDate > best.latestDate)
    ) {
      best = stats
    }
  }

  return best ? { vendorName: best.vendorName, vendorEmail: best.vendorEmail } : null
}

async function forEachPurchaseOrder(
  accessToken: string,
  orgId: string,
  statuses: string[],
  handlePo: (po: any) => void | Promise<void>
) {
  for (const status of statuses) {
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

      for (const po of purchaseOrders) {
        await handlePo(po)
      }

      hasMore = data.page_context?.has_more_page ?? false
      page++
    }
  }
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
