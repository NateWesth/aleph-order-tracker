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
    // Parse webhook payload from Zoho
    let payload: any = {}
    const contentType = req.headers.get('content-type') || ''
    
    if (contentType.includes('application/json')) {
      payload = await req.json()
    } else if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
      // Zoho webhooks often send form-encoded data
      const formData = await req.formData().catch(() => null)
      if (formData) {
        for (const [key, value] of formData.entries()) {
          payload[key] = value
        }
        // Zoho may send JSON string in a field
        if (payload.JSONString) {
          try { payload = JSON.parse(payload.JSONString) } catch {}
        }
      }
    } else {
      // Try raw text/JSON
      const text = await req.text()
      try { payload = JSON.parse(text) } catch {
        payload = { raw: text }
      }
    }

    console.log('Zoho webhook received:', JSON.stringify(payload).substring(0, 500))

    // Extract the sales order ID from the webhook payload
    const salesOrderId = payload.salesorder_id || payload.resource_id || payload.id || 
      payload.salesorder?.salesorder_id || payload.data?.salesorder_id
    
    if (!salesOrderId) {
      console.log('No sales order ID found in webhook payload. Full payload:', JSON.stringify(payload))
      // Still return 200 to avoid Zoho retrying
      return new Response(JSON.stringify({ received: true, warning: 'No sales order ID found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    console.log('Processing sales order:', salesOrderId)

    // Get a valid access token
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

    // Fetch full sales order details from Zoho
    const soResponse = await fetch(
      `${ZOHO_API_URL}/books/v3/salesorders/${salesOrderId}?organization_id=${orgId}`,
      { headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` } }
    )
    const soData = await soResponse.json()

    if (soData.code !== 0 || !soData.salesorder) {
      console.error('Failed to fetch sales order from Zoho:', soData.message || soData)
      throw new Error(`Failed to fetch sales order: ${soData.message || 'Unknown error'}`)
    }

    const salesOrder = soData.salesorder
    console.log('Sales order details:', salesOrder.salesorder_number, '- Customer:', salesOrder.customer_name)

    // 1. Match or create the company from the customer
    let companyId: string | null = null
    if (salesOrder.customer_name || salesOrder.customer_id) {
      companyId = await matchOrCreateCompany(supabase, salesOrder)
    }

    // 2. Map Zoho fields:
    //    - Zoho "Reference#" → our order_number (the main identifier in our app)
    //    - Zoho "Sales Order Number" → our reference field (displayed as a small SO# label)
    const zohoSONumber = salesOrder.salesorder_number || `SO-${salesOrderId}`
    const orderNumber = salesOrder.reference_number || zohoSONumber

    // Check if this order already exists by SO number in reference (prevent duplicates)
    const { data: existingOrder } = await supabase
      .from('orders')
      .select('id')
      .eq('reference', zohoSONumber)
      .maybeSingle()

    if (existingOrder) {
      console.log('Order already exists for SO:', zohoSONumber)
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Order already exists', 
        order_id: existingOrder.id 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 3. Create the order
    const description = (salesOrder.line_items || []).map((li: any) =>
      `${li.name || li.item_name} (Qty: ${li.quantity})`
    ).join('\n')

    const { data: newOrder, error: orderError } = await supabase
      .from('orders')
      .insert({
        order_number: orderNumber,
        description,
        status: 'ordered',
        total_amount: salesOrder.total || null,
        company_id: companyId,
        reference: zohoSONumber,
        notes: salesOrder.notes || null,
        urgency: 'normal',
      })
      .select('id')
      .single()

    if (orderError) {
      console.error('Failed to create order:', orderError)
      throw new Error(`Failed to create order: ${orderError.message}`)
    }

    console.log('Created order:', newOrder.id, orderNumber)

    // 4. Create order_items by matching SKU/item code
    const lineItems = salesOrder.line_items || []
    let itemsCreated = 0

    for (const lineItem of lineItems) {
      const itemCode = lineItem.sku || lineItem.item_code || null
      const itemName = lineItem.name || lineItem.item_name || lineItem.description || 'Unknown Item'

      // Try to find matching item in our items table by code
      let matchedCode = itemCode
      if (itemCode) {
        const { data: existingItem } = await supabase
          .from('items')
          .select('code, name')
          .ilike('code', itemCode)
          .maybeSingle()

        if (existingItem) {
          matchedCode = existingItem.code
        }
      }

      const { error: itemError } = await supabase
        .from('order_items')
        .insert({
          order_id: newOrder.id,
          name: itemName,
          code: matchedCode,
          quantity: lineItem.quantity || 1,
          stock_status: 'awaiting',
          progress_stage: 'awaiting-stock',
          notes: lineItem.description !== itemName ? lineItem.description : null,
        })

      if (itemError) {
        console.error(`Failed to create order item ${itemName}:`, itemError)
      } else {
        itemsCreated++
      }
    }

    // Log sync
    await supabase.from('zoho_sync_log').insert({
      sync_type: 'salesorder_webhook',
      status: 'completed',
      items_synced: itemsCreated + 1, // order + items
      completed_at: new Date().toISOString(),
    })

    console.log(`Sales order ${orderNumber} created with ${itemsCreated} items`)

    return new Response(JSON.stringify({
      success: true,
      order_id: newOrder.id,
      order_number: orderNumber,
      items_created: itemsCreated,
      company_id: companyId,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Zoho webhook error:', error)

    await supabase.from('zoho_sync_log').insert({
      sync_type: 'salesorder_webhook',
      status: 'failed',
      error_message: error instanceof Error ? error.message : 'Unknown error',
      completed_at: new Date().toISOString(),
    })

    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Webhook processing failed',
    }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

// Match customer to existing company or create a new one
async function matchOrCreateCompany(supabase: any, salesOrder: any): Promise<string | null> {
  const customerName = salesOrder.customer_name
  const customerEmail = salesOrder.email
  
  // Try matching by name (case-insensitive)
  const { data: byName } = await supabase
    .from('companies')
    .select('id')
    .ilike('name', customerName)
    .maybeSingle()

  if (byName) return byName.id

  // Try matching by email
  if (customerEmail) {
    const { data: byEmail } = await supabase
      .from('companies')
      .select('id')
      .ilike('email', customerEmail)
      .maybeSingle()

    if (byEmail) return byEmail.id
  }

  // Create new company
  const code = `ZOHO-${salesOrder.customer_id || customerName.substring(0, 10).toUpperCase().replace(/\s/g, '')}`
  
  const { data: newCompany, error } = await supabase
    .from('companies')
    .insert({
      code,
      name: customerName,
      email: customerEmail || null,
      phone: salesOrder.phone || salesOrder.mobile || null,
      contact_person: salesOrder.contact_person_details?.[0]?.first_name 
        ? `${salesOrder.contact_person_details[0].first_name} ${salesOrder.contact_person_details[0].last_name || ''}`.trim()
        : null,
      address: formatAddress(salesOrder.billing_address),
    })
    .select('id')
    .single()

  if (error) {
    console.error('Failed to create company:', error)
    return null
  }

  console.log('Created new company:', customerName, newCompany.id)
  return newCompany.id
}

function formatAddress(addr: any): string | null {
  if (!addr) return null
  const parts = [addr.address, addr.street2, addr.city, addr.state, addr.zip, addr.country]
  return parts.filter(Boolean).join(', ') || null
}

// Get a valid access token, refreshing if needed
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
