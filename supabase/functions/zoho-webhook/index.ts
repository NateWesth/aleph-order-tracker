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
      const formData = await req.formData().catch(() => null)
      if (formData) {
        for (const [key, value] of formData.entries()) {
          payload[key] = value
        }
        if (payload.JSONString) {
          try { payload = JSON.parse(payload.JSONString) } catch {}
        }
      }
    } else {
      const text = await req.text()
      try { payload = JSON.parse(text) } catch {
        payload = { raw: text }
      }
    }

    console.log('Zoho webhook received:', JSON.stringify(payload).substring(0, 500))

    // Detect event type - invoice or sales order
    const invoiceId = payload.invoice_id || payload.data?.invoice_id || payload.invoice?.invoice_id
    const salesOrderId = payload.salesorder_id || payload.resource_id || payload.id || 
      payload.salesorder?.salesorder_id || payload.data?.salesorder_id

    if (invoiceId) {
      return await handleInvoiceWebhook(supabase, payload, invoiceId, clientId, clientSecret)
    }

    if (salesOrderId) {
      return await handleSalesOrderWebhook(supabase, payload, salesOrderId, clientId, clientSecret)
    }

    console.log('No recognized ID in webhook payload. Full payload:', JSON.stringify(payload))
    return new Response(JSON.stringify({ received: true, warning: 'No recognized event ID found' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Zoho webhook error:', error)

    await supabase.from('zoho_sync_log').insert({
      sync_type: 'webhook',
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

// ─── INVOICE WEBHOOK HANDLER ───────────────────────────────────────────────────

async function handleInvoiceWebhook(
  supabase: any, payload: any, invoiceId: string,
  clientId: string, clientSecret: string
) {
  console.log('Processing invoice webhook:', invoiceId)

  const accessToken = await getValidAccessToken(supabase, clientId, clientSecret)
  const orgId = await getOrgId(supabase)

  // Fetch full invoice details from Zoho
  const invResponse = await fetch(
    `${ZOHO_API_URL}/books/v3/invoices/${invoiceId}?organization_id=${orgId}`,
    { headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` } }
  )
  const invData = await invResponse.json()

  if (invData.code !== 0 || !invData.invoice) {
    console.error('Failed to fetch invoice from Zoho:', invData.message || invData)
    throw new Error(`Failed to fetch invoice: ${invData.message || 'Unknown error'}`)
  }

  const invoice = invData.invoice
  console.log('Invoice details:', invoice.invoice_number, '- Reference:', invoice.reference_number)

  // The invoice reference_number should match the Zoho SO number,
  // which is stored in our orders.reference field.
  // Also try matching against salesorder_number from the invoice's salesorders array.
  const possibleSONumbers: string[] = []
  
  if (invoice.reference_number) {
    possibleSONumbers.push(invoice.reference_number)
  }
  
  // Zoho invoices can reference sales orders directly
  if (invoice.salesorders && Array.isArray(invoice.salesorders)) {
    for (const so of invoice.salesorders) {
      if (so.salesorder_number) possibleSONumbers.push(so.salesorder_number)
    }
  }

  if (possibleSONumbers.length === 0) {
    console.log('No reference/SO number found on invoice to match orders')
    return new Response(JSON.stringify({ 
      received: true, 
      warning: 'No reference number on invoice to match orders' 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  console.log('Looking for orders with reference in:', possibleSONumbers)

  // Find matching order(s) in our app by the reference field (Zoho SO number)
  const { data: matchingOrders, error: orderErr } = await supabase
    .from('orders')
    .select('id, order_number, reference')
    .in('reference', possibleSONumbers)

  if (orderErr || !matchingOrders || matchingOrders.length === 0) {
    // Also try matching by order_number
    const { data: byOrderNum } = await supabase
      .from('orders')
      .select('id, order_number, reference')
      .in('order_number', possibleSONumbers)

    if (!byOrderNum || byOrderNum.length === 0) {
      console.log('No matching orders found for SO numbers:', possibleSONumbers)
      return new Response(JSON.stringify({ 
        received: true, 
        warning: 'No matching order found for invoice reference' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    
    matchingOrders.push(...byOrderNum)
  }

  const invoiceLineItems = invoice.line_items || []
  let totalItemsUpdated = 0

  for (const order of matchingOrders) {
    console.log(`Processing order ${order.order_number} (${order.id})`)

    // Get all order items for this order
    const { data: orderItems, error: itemsErr } = await supabase
      .from('order_items')
      .select('id, name, code, quantity, progress_stage')
      .eq('order_id', order.id)

    if (itemsErr || !orderItems) {
      console.error(`Failed to fetch items for order ${order.id}:`, itemsErr)
      continue
    }

    // Match invoice line items to order items by SKU/code AND quantity
    for (const invoiceLine of invoiceLineItems) {
      const invoiceSku = invoiceLine.sku || invoiceLine.item_code || null
      const invoiceQty = invoiceLine.quantity || 0

      if (!invoiceSku) {
        console.log('Skipping invoice line without SKU:', invoiceLine.name || invoiceLine.item_name)
        continue
      }

      // Find matching order items by code (case-insensitive)
      const matchedItems = orderItems.filter((oi: any) => 
        oi.code && oi.code.toLowerCase() === invoiceSku.toLowerCase()
      )

      for (const matchedItem of matchedItems) {
        // Only update if quantities match exactly
        if (matchedItem.quantity !== invoiceQty) {
          console.log(
            `Quantity mismatch for ${matchedItem.code}: order has ${matchedItem.quantity}, invoice has ${invoiceQty} - skipping`
          )
          continue
        }

        // Only update if item is not already at or past ready-for-delivery
        if (matchedItem.progress_stage === 'ready-for-delivery' || matchedItem.progress_stage === 'completed') {
          console.log(`Item ${matchedItem.code} already at ${matchedItem.progress_stage} - skipping`)
          continue
        }

        const { error: updateErr } = await supabase
          .from('order_items')
          .update({ 
            progress_stage: 'ready-for-delivery',
            updated_at: new Date().toISOString()
          })
          .eq('id', matchedItem.id)

        if (updateErr) {
          console.error(`Failed to update item ${matchedItem.id}:`, updateErr)
        } else {
          totalItemsUpdated++
          console.log(`Moved item ${matchedItem.code} (qty: ${matchedItem.quantity}) to ready-for-delivery`)
        }
      }
    }
  }

  // Log sync
  await supabase.from('zoho_sync_log').insert({
    sync_type: 'invoice_webhook',
    status: 'completed',
    items_synced: totalItemsUpdated,
    completed_at: new Date().toISOString(),
  })

  console.log(`Invoice ${invoice.invoice_number}: ${totalItemsUpdated} items moved to ready-for-delivery`)

  return new Response(JSON.stringify({
    success: true,
    invoice_number: invoice.invoice_number,
    items_updated: totalItemsUpdated,
    orders_matched: matchingOrders.map((o: any) => o.order_number),
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

// ─── SALES ORDER WEBHOOK HANDLER ───────────────────────────────────────────────

async function handleSalesOrderWebhook(
  supabase: any, payload: any, salesOrderId: string,
  clientId: string, clientSecret: string
) {
  console.log('Processing sales order:', salesOrderId)

  const accessToken = await getValidAccessToken(supabase, clientId, clientSecret)
  const orgId = await getOrgId(supabase)

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

  // 2. Map Zoho fields
  const zohoSONumber = salesOrder.salesorder_number || `SO-${salesOrderId}`
  const orderNumber = salesOrder.reference_number || zohoSONumber

  // Check if this order already exists
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

  // 4. Create order_items
  const lineItems = salesOrder.line_items || []
  let itemsCreated = 0

  for (const lineItem of lineItems) {
    const itemCode = lineItem.sku || lineItem.item_code || null
    const itemName = lineItem.name || lineItem.item_name || lineItem.description || 'Unknown Item'

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
    items_synced: itemsCreated + 1,
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
}

// ─── SHARED HELPERS ────────────────────────────────────────────────────────────

async function getOrgId(supabase: any): Promise<string> {
  const { data: tokenRow } = await supabase
    .from('zoho_tokens')
    .select('organization_id')
    .eq('id', '00000000-0000-0000-0000-000000000001')
    .single()

  const orgId = tokenRow?.organization_id
  if (!orgId) throw new Error('No Zoho organization ID found. Please reconnect Zoho Books.')
  return orgId
}

async function matchOrCreateCompany(supabase: any, salesOrder: any): Promise<string | null> {
  const customerName = salesOrder.customer_name
  const customerEmail = salesOrder.email
  
  const { data: byName } = await supabase
    .from('companies')
    .select('id')
    .ilike('name', customerName)
    .maybeSingle()

  if (byName) return byName.id

  if (customerEmail) {
    const { data: byEmail } = await supabase
      .from('companies')
      .select('id')
      .ilike('email', customerEmail)
      .maybeSingle()

    if (byEmail) return byEmail.id
  }

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
