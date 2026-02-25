import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const ZOHO_AUTH_URL = 'https://accounts.zoho.com/oauth/v2'
const ZOHO_API_URL = 'https://www.zohoapis.com'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // Validate authentication
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized - Bearer token required' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const supabaseAuth = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const token = authHeader.replace('Bearer ', '');
  const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
  if (claimsError || !claimsData?.claims) {
    return new Response(
      JSON.stringify({ error: 'Invalid or expired token' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const userId = claimsData.claims.sub;

  // Require admin role for Zoho sync
  const { data: userRole } = await supabaseAuth.from('user_roles').select('role').eq('user_id', userId).single();
  if (userRole?.role !== 'admin') {
    return new Response(
      JSON.stringify({ error: 'Forbidden - Admin access required' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
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
    // Parse sync type from request body or default to full
    let syncType = 'full'
    if (req.method === 'POST') {
      try {
        const body = await req.json()
        syncType = body.sync_type || 'full'
      } catch { /* default to full */ }
    }

    // Create sync log entry
    const { data: syncLog } = await supabase
      .from('zoho_sync_log')
      .insert({ sync_type: syncType, status: 'running' })
      .select()
      .single()

    const syncLogId = syncLog?.id

    // Get fresh access token
    const accessToken = await getValidAccessToken(supabase, clientId, clientSecret)

    // Get organization ID
    const { data: tokenRow } = await supabase
      .from('zoho_tokens')
      .select('organization_id')
      .eq('id', '00000000-0000-0000-0000-000000000001')
      .single()

    const orgId = tokenRow?.organization_id
    if (!orgId) {
      throw new Error('No Zoho organization ID found. Please reconnect Zoho Books.')
    }

    let totalSynced = 0

    // Sync Items
    if (syncType === 'full' || syncType === 'items') {
      const itemsSynced = await syncItems(supabase, accessToken, orgId)
      totalSynced += itemsSynced
      console.log(`Synced ${itemsSynced} items`)
    }

    // Sync Contacts → Companies
    if (syncType === 'full' || syncType === 'contacts') {
      const contactsSynced = await syncContacts(supabase, accessToken, orgId)
      totalSynced += contactsSynced
      console.log(`Synced ${contactsSynced} contacts`)
    }

    // Sync Purchase Orders
    if (syncType === 'full' || syncType === 'purchase_orders') {
      const posSynced = await syncPurchaseOrders(supabase, accessToken, orgId)
      totalSynced += posSynced
      console.log(`Synced ${posSynced} purchase orders`)
    }

    // Update sync log
    if (syncLogId) {
      await supabase
        .from('zoho_sync_log')
        .update({
          status: 'completed',
          items_synced: totalSynced,
          completed_at: new Date().toISOString(),
        })
        .eq('id', syncLogId)
    }

    return new Response(JSON.stringify({
      success: true,
      sync_type: syncType,
      total_synced: totalSynced,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Zoho sync error:', error)

    // Log failure
    await supabase
      .from('zoho_sync_log')
      .insert({
        sync_type: 'full',
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'Unknown error',
        completed_at: new Date().toISOString(),
      })

    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Sync failed',
    }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

// Get a valid access token, refreshing if needed
async function getValidAccessToken(supabase: any, clientId: string, clientSecret: string): Promise<string> {
  const { data: tokenRow } = await supabase
    .from('zoho_tokens')
    .select('*')
    .eq('id', '00000000-0000-0000-0000-000000000001')
    .single()

  if (!tokenRow) {
    throw new Error('No Zoho tokens found. Please connect Zoho Books first.')
  }

  // Check if token is expired or about to expire (5 min buffer)
  const expiresAt = new Date(tokenRow.expires_at)
  if (expiresAt.getTime() - Date.now() > 5 * 60 * 1000) {
    return tokenRow.access_token
  }

  // Refresh the token
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
  if (tokenData.error) {
    throw new Error(`Token refresh failed: ${tokenData.error}`)
  }

  await supabase
    .from('zoho_tokens')
    .update({
      access_token: tokenData.access_token,
      expires_at: new Date(Date.now() + (tokenData.expires_in || 3600) * 1000).toISOString(),
    })
    .eq('id', '00000000-0000-0000-0000-000000000001')

  return tokenData.access_token
}

// Fetch all pages from a Zoho Books endpoint
async function fetchAllPages(accessToken: string, orgId: string, endpoint: string, listKey: string) {
  let allItems: any[] = []
  let page = 1
  let hasMore = true

  while (hasMore) {
    const response = await fetch(
      `${ZOHO_API_URL}/books/v3/${endpoint}?organization_id=${orgId}&page=${page}&per_page=200`,
      { headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` } }
    )

    const data = await response.json()
    if (data.code !== 0) {
      console.error(`Zoho API error for ${endpoint}:`, data.message)
      break
    }

    const items = data[listKey] || []
    allItems = [...allItems, ...items]
    hasMore = data.page_context?.has_more_page || false
    page++
  }

  return allItems
}

// Sync Zoho Books Items → items table
async function syncItems(supabase: any, accessToken: string, orgId: string): Promise<number> {
  const zohoItems = await fetchAllPages(accessToken, orgId, 'items', 'items')
  let synced = 0

  for (const item of zohoItems) {
    const { error } = await supabase
      .from('items')
      .upsert({
        code: item.sku || item.item_id || `ZOHO-${item.item_id}`,
        name: item.name || item.item_name,
        description: item.description || null,
        unit: item.unit || 'pcs',
      }, { onConflict: 'code' })

    if (error) {
      console.error(`Failed to upsert item ${item.name}:`, error.message)
    } else {
      synced++
    }
  }

  return synced
}

// Sync Zoho Books Contacts → companies table
async function syncContacts(supabase: any, accessToken: string, orgId: string): Promise<number> {
  const zohoContacts = await fetchAllPages(accessToken, orgId, 'contacts', 'contacts')
  let synced = 0

  for (const contact of zohoContacts) {
    // Use contact_id as a unique code prefix
    const code = contact.contact_number || `ZOHO-${contact.contact_id}`
    
    const { error } = await supabase
      .from('companies')
      .upsert({
        code,
        name: contact.company_name || contact.contact_name,
        contact_person: contact.contact_name || null,
        email: contact.email || null,
        phone: contact.phone || contact.mobile || null,
        address: formatAddress(contact.billing_address),
        vat_number: contact.gst_no || contact.vat_reg_no || null,
      }, { onConflict: 'code' })

    if (error) {
      console.error(`Failed to upsert contact ${contact.contact_name}:`, error.message)
    } else {
      synced++
    }
  }

  return synced
}

// Sync Zoho Books Purchase Orders → orders + suppliers
async function syncPurchaseOrders(supabase: any, accessToken: string, orgId: string): Promise<number> {
  const zohoPOs = await fetchAllPages(accessToken, orgId, 'purchaseorders', 'purchaseorders')
  let synced = 0

  for (const po of zohoPOs) {
    // First ensure the vendor/supplier exists
    let supplierId: string | null = null
    if (po.vendor_name) {
      const supplierCode = `ZOHO-V-${po.vendor_id || po.vendor_name.substring(0, 10)}`
      const { data: supplier } = await supabase
        .from('suppliers')
        .upsert({
          code: supplierCode,
          name: po.vendor_name,
        }, { onConflict: 'code' })
        .select('id')
        .single()

      supplierId = supplier?.id
    }

    // Map PO status to our order status
    const statusMap: Record<string, string> = {
      draft: 'pending',
      open: 'ordered',
      billed: 'completed',
      cancelled: 'cancelled',
    }

    const orderNumber = po.purchaseorder_number || `ZOHO-PO-${po.purchaseorder_id}`
    
    // Build description from line items
    const description = po.line_items?.map((li: any) =>
      `${li.name || li.item_name} (Qty: ${li.quantity})`
    ).join('\n') || po.notes || ''

    const { error } = await supabase
      .from('orders')
      .upsert({
        order_number: orderNumber,
        description,
        status: statusMap[po.status] || 'pending',
        total_amount: po.total || null,
        supplier_id: supplierId,
        purchase_order_number: po.purchaseorder_number,
        notes: po.notes || null,
        reference: po.reference_number || null,
      }, { onConflict: 'order_number' })

    if (error) {
      console.error(`Failed to upsert PO ${orderNumber}:`, error.message)
    } else {
      synced++
    }
  }

  return synced
}

function formatAddress(addr: any): string | null {
  if (!addr) return null
  const parts = [addr.address, addr.street2, addr.city, addr.state, addr.zip, addr.country]
  return parts.filter(Boolean).join(', ') || null
}
