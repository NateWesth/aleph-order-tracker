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
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  try {
    // Verify auth
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const accessToken = await getValidAccessToken(supabase, clientId, clientSecret)
    const orgId = await getOrgId(supabase)

    // 1. Fetch all items with stock from Zoho Books
    const stockMap = new Map<string, { stockOnHand: number; itemName: string; vendorName: string }>()
    let page = 1
    let hasMore = true

    while (hasMore) {
      const resp = await fetch(
        `${ZOHO_API_URL}/books/v3/items?organization_id=${orgId}&page=${page}&per_page=200`,
        { headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` } }
      )
      const data = await resp.json()

      if (data.code !== 0 || !data.items?.length) {
        hasMore = false
        break
      }

      for (const item of data.items) {
        const sku = item.sku || item.item_id
        if (sku) {
          stockMap.set(sku.toUpperCase(), {
            stockOnHand: item.stock_on_hand ?? item.available_stock ?? 0,
            itemName: item.name || item.description || '',
          })
        }
      }

      hasMore = data.page_context?.has_more_page ?? false
      page++
    }

    console.log(`Fetched stock for ${stockMap.size} items from Zoho`)

    // 2. Fetch open/pending purchase orders from Zoho
    const poQtyMap = new Map<string, number>() // SKU -> total qty on POs
    page = 1
    hasMore = true

    while (hasMore) {
      const resp = await fetch(
        `${ZOHO_API_URL}/books/v3/purchaseorders?organization_id=${orgId}&status=open&page=${page}&per_page=200`,
        { headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` } }
      )
      const data = await resp.json()

      if (data.code !== 0 || !data.purchaseorders?.length) {
        hasMore = false
        break
      }

      // For each PO, fetch its line items
      for (const po of data.purchaseorders) {
        const detailResp = await fetch(
          `${ZOHO_API_URL}/books/v3/purchaseorders/${po.purchaseorder_id}?organization_id=${orgId}`,
          { headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` } }
        )
        const detailData = await detailResp.json()

        if (detailData.code === 0 && detailData.purchaseorder?.line_items) {
          for (const lineItem of detailData.purchaseorder.line_items) {
            const sku = (lineItem.sku || lineItem.item_id || '').toUpperCase()
            if (sku) {
              const existing = poQtyMap.get(sku) || 0
              poQtyMap.set(sku, existing + (lineItem.quantity || 0))
            }
          }
        }
      }

      hasMore = data.page_context?.has_more_page ?? false
      page++
    }

    console.log(`Fetched PO quantities for ${poQtyMap.size} SKUs from Zoho`)

    // Return combined data
    const result: Record<string, { stockOnHand: number; onPurchaseOrder: number }> = {}

    // Merge stock and PO data by SKU
    const allSkus = new Set([...stockMap.keys(), ...poQtyMap.keys()])
    for (const sku of allSkus) {
      result[sku] = {
        stockOnHand: stockMap.get(sku)?.stockOnHand ?? 0,
        onPurchaseOrder: poQtyMap.get(sku) ?? 0,
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      data: result,
      itemCount: allSkus.size,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Buying sheet data error:', error)
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Failed to fetch Zoho data',
    }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

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
