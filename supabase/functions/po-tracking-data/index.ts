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
const DETAIL_CONCURRENCY = 4
const CACHE_TTL_MS = 15 * 60 * 1000
const CACHE_ID = '00000000-0000-0000-0000-000000000001'

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

    let force = false
    if (req.method === 'POST') {
      try {
        const body = await req.json()
        force = body?.force === true
      } catch (_e) { /* no body */ }
    }

    // Serve from cache when fresh — Zoho round trips are the slow part
    if (!force) {
      const { data: cached } = await supabase
        .from('po_tracking_cache')
        .select('payload, fetched_at')
        .eq('id', CACHE_ID)
        .maybeSingle()

      if (cached?.payload && cached.fetched_at) {
        const age = Date.now() - new Date(cached.fetched_at).getTime()
        if (age < CACHE_TTL_MS) {
          const purchaseOrders = cached.payload as POEntry[]
          return new Response(JSON.stringify({
            success: true,
            purchaseOrders,
            count: purchaseOrders.length,
            fetchedAt: cached.fetched_at,
            cached: true,
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }
      }
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
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('PO tracking data error:', error)
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Failed to fetch Zoho purchase orders',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
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

      const status = String(summary.status || '').toLowerCase()
      const billedStatus = String(summary.billed_status || '').toLowerCase()
      if (EXCLUDED_PO_STATUSES.includes(status)) continue
      if (billedStatus === 'billed') continue
      candidates.push(summary)
    }

    hasMore = data.page_context?.has_more_page ?? false
    page++
  }


  // 2. Fetch detail records in parallel batches instead of one-by-one
  const results: POEntry[] = []

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
      const status = String(summary.status || '').toLowerCase()
      const detailBilled = String(po.billed_status || summary.billed_status || '').toLowerCase()
      if (detailBilled === 'billed') continue

      const rawLines = Array.isArray(po.line_items) ? po.line_items : []
      const lines: POLine[] = []

      for (const line of rawLines) {
        const sku = String(line.sku || '').trim()
        if (isExcludedSku(sku)) continue

        const quantity = Number(line.quantity || 0)
        const quantityReceived = Number(line.quantity_received ?? 0)
        const quantityBilled = Number(line.quantity_billed ?? 0)
        const outstanding = Math.max(0, quantity - Math.max(quantityBilled, 0))
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
