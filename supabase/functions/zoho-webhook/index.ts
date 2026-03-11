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

    // Support bulk resync of all orders (re-fetches descriptions from Zoho)
    if (payload.action === 'resync_all_items') {
      return await handleBulkResyncItems(supabase, clientId, clientSecret)
    }

    // Support lookup by salesorder_number (e.g. "SO-00005") for manual re-sync
    const salesOrderNumber = payload.salesorder_number
    if (salesOrderNumber) {
      return await handleSalesOrderByNumber(supabase, payload, salesOrderNumber, clientId, clientSecret)
    }

    // Detect event type - invoice or sales order
    // Support manual invoice check by order number
    if (payload.action === 'check_invoices') {
      return await handleCheckInvoicesForOrder(supabase, payload, clientId, clientSecret)
    }

    // Support scanning ALL recent invoices to match orders
    if (payload.action === 'scan_all_invoices') {
      return await handleScanAllInvoices(supabase, clientId, clientSecret)
    }

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

// ─── SALES ORDER BY NUMBER (manual re-sync) ────────────────────────────────────

async function handleSalesOrderByNumber(
  supabase: any, payload: any, soNumber: string,
  clientId: string, clientSecret: string
) {
  console.log('Looking up sales order by number:', soNumber)

  const accessToken = await getValidAccessToken(supabase, clientId, clientSecret)
  const orgId = await getOrgId(supabase)

  // Search for the sales order by number
  const searchResp = await fetch(
    `${ZOHO_API_URL}/books/v3/salesorders?organization_id=${orgId}&salesorder_number=${encodeURIComponent(soNumber)}`,
    { headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` } }
  )
  const searchData = await searchResp.json()

  if (searchData.code !== 0 || !searchData.salesorders?.length) {
    console.error('Sales order not found by number:', soNumber, searchData.message)
    return new Response(JSON.stringify({ error: `Sales order ${soNumber} not found` }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  const salesOrderId = searchData.salesorders[0].salesorder_id
  console.log('Found salesorder_id:', salesOrderId, 'for', soNumber)

  return await handleSalesOrderWebhook(supabase, payload, salesOrderId, clientId, clientSecret)
}

// ─── BULK RESYNC ITEM DESCRIPTIONS ─────────────────────────────────────────────

async function handleBulkResyncItems(
  supabase: any, clientId: string, clientSecret: string
) {
  console.log('Starting bulk resync of all order item descriptions from Zoho')

  const accessToken = await getValidAccessToken(supabase, clientId, clientSecret)
  const orgId = await getOrgId(supabase)

  // Get all orders that have a Zoho SO reference
  const { data: orders, error: ordersErr } = await supabase
    .from('orders')
    .select('id, order_number, reference')
    .not('reference', 'is', null)
    .like('reference', 'SO-%')

  if (ordersErr || !orders?.length) {
    console.log('No orders with SO references found')
    return new Response(JSON.stringify({ message: 'No orders to resync', count: 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  let totalUpdated = 0
  let ordersProcessed = 0

  for (const order of orders) {
    try {
      // Look up the sales order in Zoho by its SO number (stored in reference)
      const searchResp = await fetch(
        `${ZOHO_API_URL}/books/v3/salesorders?organization_id=${orgId}&salesorder_number=${encodeURIComponent(order.reference)}`,
        { headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` } }
      )
      const searchData = await searchResp.json()

      if (searchData.code !== 0 || !searchData.salesorders?.length) {
        console.log(`SO not found for ${order.reference} - skipping`)
        continue
      }

      const soId = searchData.salesorders[0].salesorder_id

      // Fetch full sales order details
      const soResp = await fetch(
        `${ZOHO_API_URL}/books/v3/salesorders/${soId}?organization_id=${orgId}`,
        { headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` } }
      )
      const soData = await soResp.json()

      if (soData.code !== 0 || !soData.salesorder) {
        console.log(`Failed to fetch SO details for ${order.reference}`)
        continue
      }

      const lineItems = soData.salesorder.line_items || []
      const itemsSynced = await syncOrderItems(supabase, order.id, lineItems)
      totalUpdated += itemsSynced
      ordersProcessed++
      console.log(`Resynced ${order.reference}: ${itemsSynced} items updated/created`)
    } catch (err) {
      console.error(`Error resyncing ${order.reference}:`, err)
    }
  }

  await supabase.from('zoho_sync_log').insert({
    sync_type: 'bulk_resync_items',
    status: 'completed',
    items_synced: totalUpdated,
    completed_at: new Date().toISOString(),
  })

  console.log(`Bulk resync complete: ${ordersProcessed} orders, ${totalUpdated} items updated`)

  return new Response(JSON.stringify({
    success: true,
    orders_processed: ordersProcessed,
    items_updated: totalUpdated,
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

// ─── INVOICE WEBHOOK HANDLER ───────────────────────────────────────────────────

async function handleInvoiceWebhook(
  supabase: any, payload: any, invoiceId: string,
  clientId: string, clientSecret: string
) {
  console.log('=== INVOICE WEBHOOK START ===')
  console.log('Invoice ID:', invoiceId)

  const accessToken = await getValidAccessToken(supabase, clientId, clientSecret)
  const orgId = await getOrgId(supabase)

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
  console.log('Invoice number:', invoice.invoice_number)
  console.log('Invoice reference_number:', invoice.reference_number)
  console.log('Invoice salesorder_ids:', JSON.stringify(invoice.salesorders || []))
  console.log('Invoice PO number:', invoice.purchase_order || invoice.purchaseorder_number)

  // Try multiple fields to find the order_number match
  const possibleMatches: string[] = []
  
  if (invoice.reference_number) possibleMatches.push(invoice.reference_number)
  if (invoice.purchase_order) possibleMatches.push(invoice.purchase_order)
  if (invoice.purchaseorder_number) possibleMatches.push(invoice.purchaseorder_number)
  
  // Also check linked salesorder reference numbers
  if (invoice.salesorders && invoice.salesorders.length > 0) {
    for (const so of invoice.salesorders) {
      if (so.reference_number) possibleMatches.push(so.reference_number)
      if (so.salesorder_number) {
        // Fetch SO details to get its reference_number (our order_number)
        try {
          const soResp = await fetch(
            `${ZOHO_API_URL}/books/v3/salesorders/${so.salesorder_id}?organization_id=${orgId}`,
            { headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` } }
          )
          const soData = await soResp.json()
          if (soData.salesorder?.reference_number) {
            possibleMatches.push(soData.salesorder.reference_number)
          }
        } catch (e) {
          console.error('Failed to fetch linked SO:', e)
        }
      }
    }
  }

  // Deduplicate and filter empty
  const uniqueMatches = [...new Set(possibleMatches.filter(Boolean))]
  console.log('Possible order_number matches to try:', uniqueMatches)

  if (uniqueMatches.length === 0) {
    console.log('No reference/PO number found on invoice - cannot match')
    return new Response(JSON.stringify({ 
      received: true, 
      warning: 'No reference or PO number found on invoice to match against orders' 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  // Try each possible match
  let matchedOrders: any[] = []
  for (const ref of uniqueMatches) {
    const { data: orders } = await supabase
      .from('orders')
      .select('id, order_number, status')
      .ilike('order_number', ref)
    
    if (orders && orders.length > 0) {
      matchedOrders.push(...orders)
    }
  }

  // Deduplicate by order id
  const seenIds = new Set<string>()
  matchedOrders = matchedOrders.filter(o => {
    if (seenIds.has(o.id)) return false
    seenIds.add(o.id)
    return true
  })

  if (matchedOrders.length === 0) {
    console.log('No matching orders found for refs:', uniqueMatches)
    return new Response(JSON.stringify({ 
      received: true, 
      warning: `No orders found matching: ${uniqueMatches.join(', ')}` 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  console.log(`Found ${matchedOrders.length} matching order(s):`, matchedOrders.map((o: any) => o.order_number))

  // Extract SKUs from invoice line items
  const invoiceLineItems = invoice.line_items || []
  const invoiceSkus = invoiceLineItems
    .map((li: any) => (li.sku || li.item_code || '').toLowerCase())
    .filter(Boolean)
  
  console.log('Invoice line item SKUs:', invoiceSkus)
  console.log('Invoice line items detail:', invoiceLineItems.map((li: any) => ({
    sku: li.sku || li.item_code,
    name: li.name || li.item_name,
    qty: li.quantity
  })))

  if (invoiceSkus.length === 0) {
    console.log('No SKUs found on invoice line items - cannot match items')
    return new Response(JSON.stringify({ 
      received: true, 
      warning: 'Invoice has no line items with SKUs',
      orders_matched: matchedOrders.map((o: any) => o.order_number),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  // Only move items whose SKU/code matches an invoice line item
  let totalItemsUpdated = 0

  for (const order of matchedOrders) {
    console.log(`Processing order ${order.order_number} (${order.id})`)

    // Get all order items
    const { data: orderItems, error: itemsErr } = await supabase
      .from('order_items')
      .select('id, name, code, quantity, progress_stage')
      .eq('order_id', order.id)

    if (itemsErr || !orderItems) {
      console.error(`Failed to fetch items for order ${order.id}:`, itemsErr)
      continue
    }

    for (const item of orderItems) {
      // Skip items already at ready-for-delivery or completed
      if (item.progress_stage === 'ready-for-delivery' || item.progress_stage === 'completed') {
        console.log(`  Item ${item.code} "${item.name}" already at ${item.progress_stage} - skipping`)
        continue
      }

      // Match by SKU/code (case-insensitive)
      const itemCode = (item.code || '').toLowerCase()
      if (!itemCode || !invoiceSkus.includes(itemCode)) {
        console.log(`  Item ${item.code} "${item.name}" not on invoice - skipping`)
        continue
      }

      const { error: updateErr } = await supabase
        .from('order_items')
        .update({ 
          progress_stage: 'ready-for-delivery',
          updated_at: new Date().toISOString()
        })
        .eq('id', item.id)

      if (updateErr) {
        console.error(`  Failed to update item ${item.id}:`, updateErr)
      } else {
        totalItemsUpdated++
        console.log(`  ✅ Moved item ${item.code} "${item.name}" to ready-for-delivery`)
      }
    }
  }

  await supabase.from('zoho_sync_log').insert({
    sync_type: 'invoice_webhook',
    status: 'completed',
    items_synced: totalItemsUpdated,
    completed_at: new Date().toISOString(),
  })

  console.log(`=== INVOICE WEBHOOK COMPLETE: ${totalItemsUpdated} items updated ===`)

  return new Response(JSON.stringify({
    success: true,
    invoice_number: invoice.invoice_number,
    items_updated: totalItemsUpdated,
    orders_matched: matchedOrders.map((o: any) => o.order_number),
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

// ─── CHECK INVOICES FOR A SPECIFIC ORDER ───────────────────────────────────────

async function handleCheckInvoicesForOrder(
  supabase: any, payload: any,
  clientId: string, clientSecret: string
) {
  const orderNumber = payload.order_number
  if (!orderNumber) {
    return new Response(JSON.stringify({ error: 'order_number is required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  console.log('Checking Zoho invoices for order_number:', orderNumber)

  const accessToken = await getValidAccessToken(supabase, clientId, clientSecret)
  const orgId = await getOrgId(supabase)

  // Search invoices by reference number matching our order number
  const searchResp = await fetch(
    `${ZOHO_API_URL}/books/v3/invoices?organization_id=${orgId}&reference_number=${encodeURIComponent(orderNumber)}`,
    { headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` } }
  )
  const searchData = await searchResp.json()

  console.log('Invoice search result:', JSON.stringify(searchData).substring(0, 500))

  if (searchData.code === 0 && searchData.invoices?.length > 0) {
    // Process each matching invoice
    const results = []
    for (const inv of searchData.invoices) {
      console.log(`Found invoice ${inv.invoice_number} for ref ${orderNumber}`)
      const result = await handleInvoiceWebhook(supabase, {}, inv.invoice_id, clientId, clientSecret)
      const body = await result.json()
      results.push(body)
    }
    return new Response(JSON.stringify({ success: true, invoices_found: searchData.invoices.length, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  // Also try searching by customer PO number
  const poSearchResp = await fetch(
    `${ZOHO_API_URL}/books/v3/invoices?organization_id=${orgId}&search_text=${encodeURIComponent(orderNumber)}`,
    { headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` } }
  )
  const poSearchData = await poSearchResp.json()

  if (poSearchData.code === 0 && poSearchData.invoices?.length > 0) {
    const results = []
    for (const inv of poSearchData.invoices) {
      if (inv.reference_number?.toLowerCase() === orderNumber.toLowerCase() || inv.purchase_order?.toLowerCase() === orderNumber.toLowerCase()) {
        console.log(`Found invoice ${inv.invoice_number} via search for ${orderNumber}`)
        const result = await handleInvoiceWebhook(supabase, {}, inv.invoice_id, clientId, clientSecret)
        const body = await result.json()
        results.push(body)
      }
    }
    if (results.length > 0) {
      return new Response(JSON.stringify({ success: true, invoices_found: results.length, results }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
  }

  return new Response(JSON.stringify({ 
    success: false, 
    message: `No invoices found in Zoho with reference "${orderNumber}"` 
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

// ─── SCAN ALL RECENT INVOICES ──────────────────────────────────────────────────

async function handleScanAllInvoices(
  supabase: any, clientId: string, clientSecret: string
) {
  console.log('=== SCANNING ALL RECENT INVOICES ===')

  const accessToken = await getValidAccessToken(supabase, clientId, clientSecret)
  const orgId = await getOrgId(supabase)

  // Fetch recent invoices (last 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const invResp = await fetch(
    `${ZOHO_API_URL}/books/v3/invoices?organization_id=${orgId}&date_after=${thirtyDaysAgo}&per_page=200`,
    { headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` } }
  )
  const invData = await invResp.json()

  if (invData.code !== 0 || !invData.invoices) {
    console.error('Failed to fetch invoices:', invData.message)
    return new Response(JSON.stringify({ error: 'Failed to fetch invoices from Zoho' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  console.log(`Found ${invData.invoices.length} invoices in last 30 days`)

  let totalMatched = 0
  let totalItemsUpdated = 0
  const matchedOrders: string[] = []

  for (const inv of invData.invoices) {
    const ref = inv.reference_number
    if (!ref) continue

    // Check if this reference matches any order_number
    const { data: orders } = await supabase
      .from('orders')
      .select('id, order_number')
      .ilike('order_number', ref)

    if (!orders || orders.length === 0) continue

    console.log(`Invoice ${inv.invoice_number} ref "${ref}" matches order(s):`, orders.map((o: any) => o.order_number))

    // Fetch full invoice details to get line items with SKUs
    const invDetailResp = await fetch(
      `${ZOHO_API_URL}/books/v3/invoices/${inv.invoice_id}?organization_id=${orgId}`,
      { headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` } }
    )
    const invDetailData = await invDetailResp.json()
    const invoiceLineItems = invDetailData?.invoice?.line_items || []
    const invoiceSkus = invoiceLineItems
      .map((li: any) => (li.sku || li.item_code || '').toLowerCase())
      .filter(Boolean)

    if (invoiceSkus.length === 0) continue

    for (const order of orders) {
      // Get order items and match by SKU
      const { data: orderItems } = await supabase
        .from('order_items')
        .select('id, code, name, progress_stage')
        .eq('order_id', order.id)

      if (!orderItems) continue

      for (const item of orderItems) {
        if (item.progress_stage === 'ready-for-delivery' || item.progress_stage === 'completed') continue
        const itemCode = (item.code || '').toLowerCase()
        if (!itemCode || !invoiceSkus.includes(itemCode)) continue

        const { error } = await supabase
          .from('order_items')
          .update({ progress_stage: 'ready-for-delivery', updated_at: new Date().toISOString() })
          .eq('id', item.id)

        if (!error) {
          totalItemsUpdated++
          console.log(`  ✅ ${order.order_number}: moved ${item.code} "${item.name}" to ready-for-delivery`)
        }
      }

      if (totalItemsUpdated > 0) {
        totalMatched++
        matchedOrders.push(order.order_number)
      }
    }
  }

  await supabase.from('zoho_sync_log').insert({
    sync_type: 'invoice_scan',
    status: 'completed',
    items_synced: totalItemsUpdated,
    completed_at: new Date().toISOString(),
  })

  console.log(`=== INVOICE SCAN COMPLETE: ${totalMatched} orders matched, ${totalItemsUpdated} items updated ===`)

  return new Response(JSON.stringify({
    success: true,
    invoices_scanned: invData.invoices.length,
    orders_matched: totalMatched,
    items_updated: totalItemsUpdated,
    matched_order_numbers: matchedOrders,
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

  // Fetch full sales order details from Zoho API
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
  
  // Also extract inline line_items from webhook payload as fallback
  const inlineLineItems = payload.salesorder?.line_items || payload.line_items || []
  
  // Use API line_items first, fallback to inline payload
  const lineItems = (salesOrder.line_items && salesOrder.line_items.length > 0) 
    ? salesOrder.line_items 
    : inlineLineItems

  console.log('Sales order details:', salesOrder.salesorder_number, 
    '- Customer:', salesOrder.customer_name,
    '- Line items from API:', salesOrder.line_items?.length || 0,
    '- Line items from payload:', inlineLineItems.length,
    '- Using:', lineItems.length, 'items')

  // 1. Match or create the company from the customer
  let companyId: string | null = null
  if (salesOrder.customer_name || salesOrder.customer_id) {
    companyId = await matchOrCreateCompany(supabase, salesOrder)
    console.log('Company matched/created:', companyId, 'for customer:', salesOrder.customer_name)
  }

  // 2. Map Zoho fields
  const zohoSONumber = salesOrder.salesorder_number || `SO-${salesOrderId}`
  const orderNumber = salesOrder.reference_number || zohoSONumber

  // Check if this order already exists (by reference = SO number)
  const { data: existingOrder } = await supabase
    .from('orders')
    .select('id, company_id')
    .eq('reference', zohoSONumber)
    .maybeSingle()

  if (existingOrder) {
    console.log('Order already exists for SO:', zohoSONumber, '- updating items and company')
    
    // UPDATE existing order: fix company_id if missing, and sync items
    const updates: any = { updated_at: new Date().toISOString() }
    if (!existingOrder.company_id && companyId) {
      updates.company_id = companyId
      console.log('Updating missing company_id to:', companyId)
    }

    // Update description from latest line items
    const description = lineItems.map((li: any) =>
      `${li.name || li.item_name} (Qty: ${li.quantity})`
    ).join('\n')
    if (description) {
      updates.description = description
    }

    await supabase.from('orders').update(updates).eq('id', existingOrder.id)

    // Sync items: add any new items not already in order_items
    const itemsSynced = await syncOrderItems(supabase, existingOrder.id, lineItems)

    await supabase.from('zoho_sync_log').insert({
      sync_type: 'salesorder_webhook_update',
      status: 'completed',
      items_synced: itemsSynced,
      completed_at: new Date().toISOString(),
    })

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Order updated', 
      order_id: existingOrder.id,
      items_synced: itemsSynced,
      company_updated: !existingOrder.company_id && companyId ? true : false,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  // 3. Create the order
  const description = lineItems.map((li: any) =>
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
  const itemsCreated = await syncOrderItems(supabase, newOrder.id, lineItems)

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

// ─── SYNC ORDER ITEMS ──────────────────────────────────────────────────────────

async function syncOrderItems(supabase: any, orderId: string, lineItems: any[]): Promise<number> {
  // Get existing order items
  const { data: existingItems } = await supabase
    .from('order_items')
    .select('id, name, code, quantity')
    .eq('order_id', orderId)

  const existing = existingItems || []
  let itemsCreated = 0

  for (const lineItem of lineItems) {
    const itemCode = lineItem.sku || lineItem.item_code || null
    // Always prefer Zoho line item description over catalog item name
    const itemName = lineItem.description || lineItem.name || lineItem.item_name || 'Unknown Item'
    const qty = lineItem.quantity || 1

    // Check if this item already exists in the order (by code + qty match)
    const matchedExisting = existing.find((ei: any) => {
      if (itemCode && ei.code) {
        return ei.code.toLowerCase() === itemCode.toLowerCase() && ei.quantity === qty
      }
      return ei.name.toLowerCase() === itemName.toLowerCase() && ei.quantity === qty
    })

    if (matchedExisting) {
      // Update the name if it differs (e.g. M-MISCELLANEOUS items with generic names)
      if (matchedExisting.name !== itemName) {
        console.log(`Updating item name: "${matchedExisting.name}" -> "${itemName}" (code: ${itemCode})`)
        await supabase
          .from('order_items')
          .update({ name: itemName, updated_at: new Date().toISOString() })
          .eq('id', matchedExisting.id)
      } else {
        console.log(`Item already exists: ${itemName} (Qty: ${qty}) - skipping`)
      }
      continue
    }

    // Try to match code from items table
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
        order_id: orderId,
        name: itemName,
        code: matchedCode,
        quantity: qty,
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

  return itemsCreated
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
  const customerName = salesOrder.customer_name?.trim()
  const customerEmail = salesOrder.email
  
  if (!customerName) return null

  // 1. Exact name match (case-insensitive, trimmed)
  const { data: byName } = await supabase
    .from('companies')
    .select('id')
    .ilike('name', customerName)
    .maybeSingle()

  if (byName) return byName.id

  // 2. Try matching with trimmed whitespace variations
  const { data: byTrimmedName } = await supabase
    .from('companies')
    .select('id, name')
    .ilike('name', `%${customerName}%`)

  if (byTrimmedName && byTrimmedName.length > 0) {
    // Find the best match - prefer exact substring match
    for (const company of byTrimmedName) {
      const companyNameNorm = company.name.trim().toLowerCase().replace(/\s+/g, ' ')
      const customerNameNorm = customerName.toLowerCase().replace(/\s+/g, ' ')
      if (companyNameNorm === customerNameNorm || 
          companyNameNorm.includes(customerNameNorm) || 
          customerNameNorm.includes(companyNameNorm)) {
        console.log(`Fuzzy matched company: "${customerName}" -> "${company.name}" (${company.id})`)
        return company.id
      }
    }
  }

  // 3. Try email match
  if (customerEmail) {
    const { data: byEmail } = await supabase
      .from('companies')
      .select('id')
      .ilike('email', customerEmail)
      .maybeSingle()

    if (byEmail) return byEmail.id
  }

  // 4. Try matching by Zoho customer ID code
  const zohoCode = `ZOHO-${salesOrder.customer_id}`
  const { data: byZohoCode } = await supabase
    .from('companies')
    .select('id')
    .eq('code', zohoCode)
    .maybeSingle()

  if (byZohoCode) return byZohoCode.id

  // 5. Create new company
  const code = salesOrder.customer_id ? `ZOHO-${salesOrder.customer_id}` : `ZOHO-${customerName.substring(0, 10).toUpperCase().replace(/\s/g, '')}`
  
  const { data: newCompany, error } = await supabase
    .from('companies')
    .upsert({
      code,
      name: customerName,
      email: customerEmail || null,
      phone: salesOrder.phone || salesOrder.mobile || null,
      contact_person: salesOrder.contact_person_details?.[0]?.first_name 
        ? `${salesOrder.contact_person_details[0].first_name} ${salesOrder.contact_person_details[0].last_name || ''}`.trim()
        : null,
      address: formatAddress(salesOrder.billing_address),
    }, { onConflict: 'code' })
    .select('id')
    .single()

  if (error) {
    console.error('Failed to create/upsert company:', error)
    // Last resort: try to find by code
    const { data: existingByCode } = await supabase
      .from('companies')
      .select('id')
      .eq('code', code)
      .maybeSingle()
    return existingByCode?.id || null
  }

  console.log('Created/upserted company:', customerName, newCompany.id)
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