import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { allocatePurchaseOrder, applyBillReceipt, applyInvoiceQuantities, isExcludedSku } from './quantity-flow.ts'
import {
  cacheZohoDocument,
  completeWebhookEvent,
  failWebhookEvent,
  reserveWebhookEvent,
  updateCacheFromItem,
  updateCachesFromBill,
  updateCachesFromPurchaseOrder,
  upsertVendorFromContact,
  type ZohoDocumentType,
} from './event-cache.ts'


const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-zoho-webhook-secret, x-webhook-secret',
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
  const webhookSecret = Deno.env.get('ZOHO_WEBHOOK_SECRET')
  let webhookReceiptId: string | undefined

  if (!clientId || !clientSecret) {
    return new Response(JSON.stringify({ error: 'Zoho credentials not configured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  // Refuse to run unsecured: otherwise anyone who discovers this public URL
  // could submit document ids and deliberately consume the Zoho API quota.
  if (!webhookSecret) {
    return new Response(JSON.stringify({ error: 'ZOHO_WEBHOOK_SECRET is not configured' }), {
      status: 503,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  // Zoho itself authenticates with the shared secret. The app's own admin
  // tools call this function with a Supabase session, so accept a verified
  // admin JWT as an equally trusted caller.
  const suppliedSecret = req.headers.get('x-zoho-webhook-secret') || req.headers.get('x-webhook-secret')
  let authorized = suppliedSecret === webhookSecret
  if (!authorized) {
    const bearer = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
    if (bearer) {
      const { data: userData } = await supabase.auth.getUser(bearer)
      const userId = userData?.user?.id
      if (userId) {
        const { data: role } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', userId)
          .eq('role', 'admin')
          .maybeSingle()
        authorized = Boolean(role)
      }
    }
  }
  if (!authorized) {
    return new Response(JSON.stringify({ error: 'Invalid webhook secret' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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

    // Lightweight fulfillment catch-up. It lists recent invoices but only
    // fetches detail for invoices that are new or changed versus our document cache.
    if (payload.action === 'sync_fulfillment_invoices') {
      return await handleSyncFulfillmentInvoices(supabase, clientId, clientSecret, Number(payload.since_days) || 7)
    }

    // Full rebuild of item quantities from Zoho POs, bills and invoices
    if (payload.action === 'reconcile_quantities') {
      return await handleReconcileQuantities(supabase, clientId, clientSecret, Number(payload.since_days) || 90)
    }

    const moduleHint = String(
      payload.module || payload.entity || payload.resource_type || payload.event_type || payload.event || payload.data?.module || ''
    ).toLowerCase()
    const resourceId = payload.resource_id || payload.data?.resource_id || payload.id
    const invoiceId = payload.invoice_id || payload.data?.invoice_id || payload.invoice?.invoice_id ||
      (moduleHint.includes('invoice') ? resourceId : null)
    const purchaseOrderId = payload.purchaseorder_id || payload.purchaseorder?.purchaseorder_id ||
      payload.data?.purchaseorder?.purchaseorder_id || payload.data?.purchaseorder_id ||
      (moduleHint.includes('purchaseorder') || moduleHint.includes('purchase_order') ? resourceId : null)
    const billId = payload.bill_id || payload.bill?.bill_id || payload.data?.bill?.bill_id || payload.data?.bill_id ||
      (moduleHint.includes('bill') ? resourceId : null)
    const vendorId = payload.vendor_id || payload.contact_id || payload.contact?.contact_id || payload.data?.contact_id ||
      (moduleHint.includes('vendor') || moduleHint.includes('contact') ? resourceId : null)
    const itemId = payload.item_id || payload.item?.item_id || payload.data?.item_id ||
      (moduleHint.includes('item') ? resourceId : null)
    const salesOrderId = payload.salesorder_id || payload.salesorder?.salesorder_id || payload.data?.salesorder_id ||
      (moduleHint.includes('salesorder') || moduleHint.includes('sales_order') ? resourceId : null)

    let documentType: ZohoDocumentType | null = null
    let documentId = ''
    if (invoiceId) { documentType = 'invoice'; documentId = String(invoiceId) }
    else if (purchaseOrderId) { documentType = 'purchase_order'; documentId = String(purchaseOrderId) }
    else if (billId) { documentType = 'bill'; documentId = String(billId) }
    else if (vendorId) { documentType = 'vendor'; documentId = String(vendorId) }
    else if (itemId) { documentType = 'item'; documentId = String(itemId) }
    else if (salesOrderId) { documentType = 'sales_order'; documentId = String(salesOrderId) }

    if (!documentType || !documentId) {
      console.log('No recognized ID in webhook payload. Full payload:', JSON.stringify(payload))
      return new Response(JSON.stringify({ received: true, warning: 'No recognized event ID found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const receipt = await reserveWebhookEvent(supabase, payload, documentType, documentId)
    if (!receipt.accepted) {
      return new Response(JSON.stringify({ received: true, duplicate: true, documentType, documentId }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    webhookReceiptId = receipt.id

    let response: Response
    if (documentType === 'invoice') response = await handleInvoiceWebhook(supabase, payload, documentId, clientId, clientSecret)
    else if (documentType === 'purchase_order') response = await handlePurchaseOrderWebhook(supabase, documentId, clientId, clientSecret)
    else if (documentType === 'bill') response = await handleBillWebhook(supabase, documentId, clientId, clientSecret)
    else if (documentType === 'vendor') response = await handleVendorWebhook(supabase, documentId, clientId, clientSecret)
    else if (documentType === 'item') response = await handleItemWebhook(supabase, documentId, clientId, clientSecret)
    else response = await handleSalesOrderWebhook(supabase, payload, documentId, clientId, clientSecret)

    await completeWebhookEvent(supabase, webhookReceiptId)
    return response

  } catch (error) {
    console.error('Zoho webhook error:', error)
    await failWebhookEvent(supabase, webhookReceiptId, error)

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
  console.log('Starting targeted resync of unresolved miscellaneous item descriptions')

  // Only contact Zoho for orders that actually contain an unresolved shared
  // M-MISC line. This repair is intentionally targeted so a one-time backfill
  // cannot consume calls by rereading every historic sales order.
  const { data: unresolvedItems, error: unresolvedErr } = await supabase
    .from('order_items')
    .select('order_id, code, name, description')
    .ilike('code', 'm-misc%')

  if (unresolvedErr) throw unresolvedErr
  const unresolvedOrderIds = [...new Set((unresolvedItems || [])
    .filter((item: any) => !String(item.description || '').trim() || isMiscItem(item.description))
    .map((item: any) => String(item.order_id || ''))
    .filter(Boolean))]

  if (unresolvedOrderIds.length === 0) {
    return new Response(JSON.stringify({ message: 'No unresolved miscellaneous lines', count: 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  const { data: orders, error: ordersErr } = await supabase
    .from('orders')
    .select('id, order_number, reference')
    .in('id', unresolvedOrderIds)
    .not('reference', 'is', null)
    .like('reference', 'SO-%')

  if (ordersErr || !orders?.length) {
    console.log('No orders with SO references found')
    return new Response(JSON.stringify({ message: 'No orders to resync', count: 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  // Prefer the existing document cache before spending Zoho API calls.
  const { data: cachedDocuments } = await supabase
    .from('zoho_document_cache')
    .select('payload')
    .eq('document_type', 'sales_order')
  const cachedByNumber = new Map<string, any>()
  for (const row of cachedDocuments || []) {
    const cached = row.payload as any
    const number = String(cached?.salesorder_number || cached?.sales_order_number || '').trim().toUpperCase()
    if (number && Array.isArray(cached?.line_items)) cachedByNumber.set(number, cached)
  }

  let accessToken = ''
  let orgId = ''
  const ensureZohoAccess = async () => {
    if (!accessToken) accessToken = await getValidAccessToken(supabase, clientId, clientSecret)
    if (!orgId) orgId = await getOrgId(supabase)
  }

  let totalUpdated = 0
  let ordersProcessed = 0

  for (const order of orders) {
    try {
      const cached = cachedByNumber.get(String(order.reference || '').trim().toUpperCase())
      if (cached) {
        const itemsSynced = await syncOrderItems(supabase, order.id, cached.line_items || [])
        totalUpdated += itemsSynced
        ordersProcessed++
        console.log(`Repaired ${order.reference} from the existing document cache`)
        continue
      }

      await ensureZohoAccess()
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
  const invoiceStatus = String(invoice.status || '').trim().toLowerCase()
  // Draft/void/cancelled invoices must never push quantities into the
  // Ready-for-Delivery bucket. Only a real active/issued invoice may do so.
  if (['draft', 'void', 'cancelled', 'canceled'].includes(invoiceStatus)) {
    await cacheZohoDocument(supabase, orgId, 'invoice', String(invoiceId), invoice)
    return new Response(JSON.stringify({ success: true, ignored: true, reason: `invoice_${invoiceStatus}`, invoice_id: invoiceId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
  const invoiceCache = await cacheZohoDocument(supabase, orgId, 'invoice', String(invoiceId), invoice)
  if (invoiceCache.unchanged) {
    return new Response(JSON.stringify({ success: true, unchanged: true, invoice_id: invoiceId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
  console.log('Invoice number:', invoice.invoice_number)
  console.log('Invoice reference_number:', invoice.reference_number)
  console.log('Invoice salesorder_ids:', JSON.stringify(invoice.salesorders || []))
  console.log('Invoice PO number:', invoice.purchase_order || invoice.purchaseorder_number)

  // Try multiple fields to find the order_number match
  const possibleMatches: string[] = []
  
  if (invoice.reference_number) possibleMatches.push(invoice.reference_number)
  if (invoice.purchase_order) possibleMatches.push(invoice.purchase_order)
  if (invoice.purchaseorder_number) possibleMatches.push(invoice.purchaseorder_number)
  
  // Also check linked sales-order reference numbers AND sales-order numbers.
  // Some Zoho invoice payloads expose the SO only as top-level fields rather
  // than in `salesorders`, so account for both representations.
  const linkedSoNumbers: string[] = []
  if (invoice.salesorder_number) linkedSoNumbers.push(String(invoice.salesorder_number))
  if (invoice.sales_order_number) linkedSoNumbers.push(String(invoice.sales_order_number))
  if (invoice.salesorders && invoice.salesorders.length > 0) {
    for (const so of invoice.salesorders) {
      if (so.reference_number) possibleMatches.push(so.reference_number)
      if (so.salesorder_number) linkedSoNumbers.push(so.salesorder_number)
      if (so.salesorder_id) {
        // Reuse the document cache before spending another API call. If this SO
        // has never been seen, fetch it once and cache it for future invoices.
        try {
          const { data: cachedSo } = await supabase
            .from('zoho_document_cache')
            .select('payload')
            .eq('organization_id', orgId)
            .eq('document_type', 'sales_order')
            .eq('document_id', String(so.salesorder_id))
            .maybeSingle()
          let linkedSalesOrder = cachedSo?.payload
          if (!linkedSalesOrder) {
            const soResp = await fetch(
              `${ZOHO_API_URL}/books/v3/salesorders/${so.salesorder_id}?organization_id=${orgId}`,
              { headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` } }
            )
            const soData = await soResp.json()
            linkedSalesOrder = soData.salesorder
            if (linkedSalesOrder) {
              await cacheZohoDocument(supabase, orgId, 'sales_order', String(so.salesorder_id), linkedSalesOrder)
            }
          }
          if (linkedSalesOrder?.reference_number) {
            possibleMatches.push(linkedSalesOrder.reference_number)
          }
          if (linkedSalesOrder?.salesorder_number) {
            linkedSoNumbers.push(linkedSalesOrder.salesorder_number)
          }
        } catch (e) {
          console.error('Failed to fetch linked SO:', e)
        }
      }
    }
  }

  const topLevelSalesOrderId = invoice.salesorder_id || invoice.sales_order_id
  if (topLevelSalesOrderId) {
    try {
      const { data: cachedSo } = await supabase
        .from('zoho_document_cache')
        .select('payload')
        .eq('organization_id', orgId)
        .eq('document_type', 'sales_order')
        .eq('document_id', String(topLevelSalesOrderId))
        .maybeSingle()
      let linkedSalesOrder = cachedSo?.payload
      if (!linkedSalesOrder) {
        const soResp = await fetch(
          `${ZOHO_API_URL}/books/v3/salesorders/${topLevelSalesOrderId}?organization_id=${orgId}`,
          { headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` } }
        )
        const soData = await soResp.json()
        linkedSalesOrder = soData.salesorder
        if (linkedSalesOrder) {
          await cacheZohoDocument(supabase, orgId, 'sales_order', String(topLevelSalesOrderId), linkedSalesOrder)
        }
      }
      if (linkedSalesOrder?.reference_number) possibleMatches.push(linkedSalesOrder.reference_number)
      if (linkedSalesOrder?.salesorder_number) linkedSoNumbers.push(linkedSalesOrder.salesorder_number)
    } catch (e) {
      console.error('Failed to resolve top-level invoice sales order:', e)
    }
  }

  // Deduplicate and filter empty
  const uniqueMatches = [...new Set(possibleMatches.filter(Boolean))]
  const uniqueSoNumbers = [...new Set(linkedSoNumbers.filter(Boolean))]
  console.log('Possible order_number matches to try:', uniqueMatches)
  console.log('Linked SO numbers to match against reference:', uniqueSoNumbers)

  if (uniqueMatches.length === 0 && uniqueSoNumbers.length === 0) {
    console.log('No reference/PO/SO number found on invoice - cannot match')
    return new Response(JSON.stringify({ 
      received: true, 
      warning: 'No reference, PO, or SO number found on invoice to match against orders' 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  // Try each possible match against order_number
  let matchedOrders: any[] = []
  for (const ref of uniqueMatches) {
    const { data: orders } = await supabase
      .from('orders')
      .select('id, order_number, status')
      .ilike('order_number', ref)
      .or('status.is.null,status.neq.delivered')
    
    if (orders && orders.length > 0) {
      matchedOrders.push(...orders)
    }
  }

  // Also try matching linked SO numbers against orders.reference field
  for (const soNum of uniqueSoNumbers) {
    const { data: orders } = await supabase
      .from('orders')
      .select('id, order_number, status')
      .ilike('reference', soNum)
      .or('status.is.null,status.neq.delivered')
    
    if (orders && orders.length > 0) {
      matchedOrders.push(...orders)
    }
  }

  // Also try matching possibleMatches against orders.reference field
  for (const ref of uniqueMatches) {
    const { data: orders } = await supabase
      .from('orders')
      .select('id, order_number, status')
      .ilike('reference', ref)
      .or('status.is.null,status.neq.delivered')
    
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

  const matchableInvoiceLines = invoiceLineItems.filter((li: any) =>
    String(li.sku || li.item_code || li.name || li.item_name || li.description || '').trim()
  )

  if (matchableInvoiceLines.length === 0) {
    console.log('No matchable SKU or name found on invoice line items')
    return new Response(JSON.stringify({ 
      received: true, 
      warning: 'Invoice has no line items with a SKU or item name',
      orders_matched: matchedOrders.map((o: any) => o.order_number),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  // Move only the invoiced quantities of the invoiced SKUs to ready-for-delivery
  const { updated: totalItemsUpdated } = await applyInvoiceQuantities(
    supabase,
    matchedOrders.map((o: any) => o.id),
    invoiceLineItems
  )
  console.log(`Invoice applied ${totalItemsUpdated} units to ready-for-delivery`)


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

async function handleSyncFulfillmentInvoices(
  supabase: any, clientId: string, clientSecret: string, sinceDays: number
) {
  const accessToken = await getValidAccessToken(supabase, clientId, clientSecret)
  const orgId = await getOrgId(supabase)
  const days = Math.max(1, Math.min(14, sinceDays || 7))
  const dateAfter = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const response = await fetch(
    `${ZOHO_API_URL}/books/v3/invoices?organization_id=${orgId}&date_after=${dateAfter}&per_page=200&sort_column=date&sort_order=D`,
    { headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` } }
  )
  const data = await response.json()
  if (data.code !== 0 || !Array.isArray(data.invoices)) {
    throw new Error(`Failed to list recent invoices: ${data.message || 'Unknown Zoho error'}`)
  }

  const summaries = data.invoices.filter((invoice: any) => {
    const status = String(invoice.status || '').trim().toLowerCase()
    return !['draft', 'void', 'cancelled', 'canceled'].includes(status)
  })
  const ids = summaries.map((invoice: any) => String(invoice.invoice_id || '')).filter(Boolean)
  const cacheMap = new Map<string, string | null>()
  if (ids.length) {
    const { data: cachedRows } = await supabase
      .from('zoho_document_cache')
      .select('document_id,source_modified_at')
      .eq('organization_id', orgId)
      .eq('document_type', 'invoice')
      .in('document_id', ids)
    for (const row of cachedRows || []) cacheMap.set(String(row.document_id), row.source_modified_at || null)
  }

  let processed = 0
  let skipped = 0
  const results: any[] = []
  for (const summary of summaries) {
    const id = String(summary.invoice_id || '')
    if (!id) continue
    const sourceModified = summary.last_modified_time || summary.updated_time || summary.modified_time || null
    const cachedModified = cacheMap.get(id)
    // If the list gives us a modification version and it matches cache, this
    // invoice is already reflected in quantity flow and needs no detail API call.
    if (cachedModified && sourceModified && String(cachedModified) === String(sourceModified)) {
      skipped += 1
      continue
    }
    // When Zoho omits a modification timestamp, an existing cache entry is our
    // best low-API signal that this invoice has already been processed.
    if (cacheMap.has(id) && !sourceModified) {
      skipped += 1
      continue
    }
    const result = await handleInvoiceWebhook(supabase, {}, id, clientId, clientSecret)
    const body = await result.json()
    results.push(body)
    processed += 1
  }

  return new Response(JSON.stringify({
    success: true,
    invoices_seen: summaries.length,
    invoices_processed: processed,
    invoices_unchanged: skipped,
    since_days: days,
    results,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

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
    const po = inv.purchase_order || inv.purchaseorder_number
    const possibleRefs = [ref, po].filter(Boolean)
    
    if (possibleRefs.length === 0) continue

    // Check if any reference matches order_number or orders.reference
    let orders: any[] = []
    for (const r of possibleRefs) {
      const { data: byOrderNum } = await supabase
        .from('orders')
        .select('id, order_number')
        .ilike('order_number', r)
        .or('status.is.null,status.neq.delivered')
      if (byOrderNum?.length) orders.push(...byOrderNum)

      const { data: byRef } = await supabase
        .from('orders')
        .select('id, order_number')
        .ilike('reference', r)
        .or('status.is.null,status.neq.delivered')
      if (byRef?.length) orders.push(...byRef)
    }

    // Deduplicate
    const seen = new Set<string>()
    orders = orders.filter(o => { if (seen.has(o.id)) return false; seen.add(o.id); return true })

    if (orders.length === 0) continue

    console.log(`Invoice ${inv.invoice_number} ref "${ref}" matches order(s):`, orders.map((o: any) => o.order_number))

    // Fetch full invoice details to get line items with SKUs
    const invDetailResp = await fetch(
      `${ZOHO_API_URL}/books/v3/invoices/${inv.invoice_id}?organization_id=${orgId}`,
      { headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` } }
    )
    const invDetailData = await invDetailResp.json()
    const invoiceLineItems = invDetailData?.invoice?.line_items || []
    const hasMatchableLine = invoiceLineItems.some((li: any) =>
      String(li.sku || li.item_code || li.name || li.item_name || li.description || '').trim()
    )
    if (!hasMatchableLine) continue

    const { updated } = await applyInvoiceQuantities(supabase, orders.map((o: any) => o.id), invoiceLineItems)
    totalItemsUpdated += updated

    if (updated > 0) {
      totalMatched++
      matchedOrders.push(...orders.map((o: any) => o.order_number))
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
  const salesOrderCache = await cacheZohoDocument(supabase, orgId, 'sales_order', String(salesOrderId), salesOrder)
  if (salesOrderCache.unchanged) {
    return new Response(JSON.stringify({ success: true, unchanged: true, salesorder_id: salesOrderId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
  
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

const MISC_ITEM_TOKENS = new Set(['m-miscellaneous', 'm-misc', 'miscellaneous', 'misc'])

function isMiscItem(value: unknown): boolean {
  const normalized = String(value || '').trim().toLowerCase()
  return Boolean(normalized) && (MISC_ITEM_TOKENS.has(normalized) || normalized.startsWith('m-misc'))
}

function salesLineDescription(lineItem: any): string {
  for (const candidate of [
    lineItem.description,
    lineItem.sales_description,
    lineItem.item_description,
    lineItem.purchase_description,
  ]) {
    const value = String(candidate || '').trim()
    if (value && !isMiscItem(value)) return value
  }
  return ''
}

async function syncOrderItems(supabase: any, orderId: string, lineItems: any[]): Promise<number> {
  // Get existing order items
  const { data: existingItems } = await supabase
    .from('order_items')
    .select('id, name, code, description, quantity')
    .eq('order_id', orderId)

  const existing = existingItems || []
  const matchedExistingIds = new Set<string>()
  let itemsCreated = 0

  for (const lineItem of lineItems) {
    const itemCode = lineItem.sku || lineItem.item_code || null

    // Shipping / handling style SKUs never belong on the order board
    if (isExcludedSku(itemCode)) {
      console.log(`Excluded SKU skipped: ${itemCode}`)
      continue
    }
    const itemDescription = salesLineDescription(lineItem)
    const catalogName = String(lineItem.name || lineItem.item_name || '').trim()
    // Generic M-MISC identifiers are not a useful customer-facing name. The
    // unique line description is the actual product and must survive sync.
    const itemName = (isMiscItem(itemCode) || isMiscItem(catalogName)) && itemDescription
      ? itemDescription
      : catalogName || itemDescription || 'Unknown Item'
    const qty = lineItem.quantity || 1

    // Check if this item already exists in the order (by code + qty match)
    const matchedExisting = existing.find((ei: any) => {
      if (matchedExistingIds.has(ei.id)) return false
      if (itemCode && ei.code) {
        const sameCodeAndQty = ei.code.toLowerCase() === itemCode.toLowerCase() && ei.quantity === qty
        if (!sameCodeAndQty) return false
        if (!isMiscItem(itemCode)) return true
        const existingDescription = String(ei.description || ei.name || '').trim().toLowerCase()
        return !itemDescription || isMiscItem(existingDescription) || existingDescription === itemDescription.toLowerCase()
      }
      return ei.name.toLowerCase() === itemName.toLowerCase() && ei.quantity === qty
    })

    if (matchedExisting) {
      matchedExistingIds.add(matchedExisting.id)
      const patch: Record<string, unknown> = {}
      if (matchedExisting.name !== itemName) patch.name = itemName
      if (itemDescription && matchedExisting.description !== itemDescription) patch.description = itemDescription
      if (Object.keys(patch).length) {
        console.log(`Refreshing item display data for ${itemCode || itemName}`)
        await supabase
          .from('order_items')
          .update({ ...patch, updated_at: new Date().toISOString() })
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
        description: itemDescription || null,
        quantity: qty,
        stock_status: 'awaiting',
        progress_stage: 'awaiting-stock',
        notes: null,
      })

    if (itemError) {
      // 23505 = unique_violation from order_items_dedup_idx — safe to skip (concurrent webhook)
      if ((itemError as any).code === '23505') {
        console.log(`Duplicate item skipped (race): ${itemName} (Qty: ${qty})`)
      } else {
        console.error(`Failed to create order item ${itemName}:`, itemError)
      }
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
// ─── PURCHASE ORDER WEBHOOK (allocates ordered quantities) ─────────────────────

async function handlePurchaseOrderWebhook(
  supabase: any, purchaseOrderId: string,
  clientId: string, clientSecret: string
) {
  console.log('Processing purchase order:', purchaseOrderId)
  const accessToken = await getValidAccessToken(supabase, clientId, clientSecret)
  const orgId = await getOrgId(supabase)

  const resp = await fetch(
    `${ZOHO_API_URL}/books/v3/purchaseorders/${purchaseOrderId}?organization_id=${orgId}`,
    { headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` } }
  )
  const data = await resp.json()
  if (data.code !== 0 || !data.purchaseorder) {
    throw new Error(`Failed to fetch purchase order: ${data.message || 'Unknown error'}`)
  }

  const cached = await cacheZohoDocument(supabase, orgId, 'purchase_order', String(purchaseOrderId), data.purchaseorder)
  if (cached.unchanged) {
    return new Response(JSON.stringify({ success: true, unchanged: true, purchaseorder_id: purchaseOrderId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  const result = await allocatePurchaseOrder(supabase, data.purchaseorder)
  await updateCachesFromPurchaseOrder(supabase, cached.previous, data.purchaseorder)

  await supabase.from('zoho_sync_log').insert({
    sync_type: 'purchase_order_webhook',
    status: 'completed',
    items_synced: result.allocated,
    completed_at: new Date().toISOString(),
  })

  console.log(`=== PO WEBHOOK COMPLETE: ${result.allocated} units allocated ===`)

  return new Response(JSON.stringify({ success: true, ...result }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

// ─── VENDOR BILL WEBHOOK (marks quantities received) ───────────────────────────

async function handleBillWebhook(
  supabase: any, billId: string,
  clientId: string, clientSecret: string
) {
  console.log('Processing vendor bill:', billId)
  const accessToken = await getValidAccessToken(supabase, clientId, clientSecret)
  const orgId = await getOrgId(supabase)

  const resp = await fetch(
    `${ZOHO_API_URL}/books/v3/bills/${billId}?organization_id=${orgId}`,
    { headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` } }
  )
  const data = await resp.json()
  if (data.code !== 0 || !data.bill) {
    throw new Error(`Failed to fetch bill: ${data.message || 'Unknown error'}`)
  }

  const cached = await cacheZohoDocument(supabase, orgId, 'bill', String(billId), data.bill)
  if (cached.unchanged) {
    return new Response(JSON.stringify({ success: true, unchanged: true, bill_id: billId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  const result = await applyBillReceipt(supabase, data.bill)
  await updateCachesFromBill(supabase, data.bill)

  // A bill changes the outstanding quantity on its linked PO. Refresh that
  // single document now (and only now) so Buying Sheet and PO Tracking receive
  // the exact same quantity without a full Zoho scan or browser polling.
  const linkedPurchaseOrderId = String(data.bill.purchaseorder_id || data.bill.purchase_order_id || '')
  if (linkedPurchaseOrderId) {
    try {
      const poResp = await fetch(
        `${ZOHO_API_URL}/books/v3/purchaseorders/${linkedPurchaseOrderId}?organization_id=${orgId}`,
        { headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` } }
      )
      const poData = await poResp.json()
      if (poData.code === 0 && poData.purchaseorder) {
        const poCached = await cacheZohoDocument(supabase, orgId, 'purchase_order', linkedPurchaseOrderId, poData.purchaseorder)
        if (!poCached.unchanged) {
          await updateCachesFromPurchaseOrder(supabase, poCached.previous, poData.purchaseorder)
        }
      }
    } catch (poRefreshError) {
      // The receipt allocation and bill cost update remain valid. A later PO
      // webhook safely retries this cache reconciliation.
      console.error('Failed to refresh linked PO after bill:', poRefreshError)
    }
  }

  await supabase.from('zoho_sync_log').insert({
    sync_type: 'bill_webhook',
    status: 'completed',
    items_synced: result.received,
    completed_at: new Date().toISOString(),
  })

  console.log(`=== BILL WEBHOOK COMPLETE: ${result.received} units received ===`)

  return new Response(JSON.stringify({ success: true, ...result }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

// ─── VENDOR WEBHOOK (one contact read, then local supplier upsert) ─────────────

async function handleVendorWebhook(
  supabase: any, contactId: string,
  clientId: string, clientSecret: string
) {
  const accessToken = await getValidAccessToken(supabase, clientId, clientSecret)
  const orgId = await getOrgId(supabase)
  const resp = await fetch(
    `${ZOHO_API_URL}/books/v3/contacts/${contactId}?organization_id=${orgId}`,
    { headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` } }
  )
  const data = await resp.json()
  if (data.code !== 0 || !data.contact) {
    throw new Error(`Failed to fetch Zoho contact: ${data.message || 'Unknown error'}`)
  }

  const cached = await cacheZohoDocument(supabase, orgId, 'vendor', String(contactId), data.contact)
  if (!cached.unchanged) await upsertVendorFromContact(supabase, data.contact)

  await supabase.from('zoho_sync_log').insert({
    sync_type: 'vendor_webhook',
    status: 'completed',
    items_synced: cached.unchanged ? 0 : 1,
    completed_at: new Date().toISOString(),
  })

  return new Response(JSON.stringify({ success: true, unchanged: cached.unchanged, contact_id: contactId }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

// ─── ITEM WEBHOOK (one item read, then buying-cache patch) ────────────────────

async function handleItemWebhook(
  supabase: any, itemId: string,
  clientId: string, clientSecret: string
) {
  const accessToken = await getValidAccessToken(supabase, clientId, clientSecret)
  const orgId = await getOrgId(supabase)
  const resp = await fetch(
    `${ZOHO_API_URL}/books/v3/items/${itemId}?organization_id=${orgId}`,
    { headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` } }
  )
  const data = await resp.json()
  if (data.code !== 0 || !data.item) {
    throw new Error(`Failed to fetch Zoho item: ${data.message || 'Unknown error'}`)
  }

  const cached = await cacheZohoDocument(supabase, orgId, 'item', String(itemId), data.item)
  if (!cached.unchanged) await updateCacheFromItem(supabase, data.item)

  await supabase.from('zoho_sync_log').insert({
    sync_type: 'item_webhook',
    status: 'completed',
    items_synced: cached.unchanged ? 0 : 1,
    completed_at: new Date().toISOString(),
  })

  return new Response(JSON.stringify({ success: true, unchanged: cached.unchanged, item_id: itemId }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

// ─── FULL QUANTITY RECONCILIATION (POs -> receipts -> invoices) ────────────────

async function handleReconcileQuantities(
  supabase: any, clientId: string, clientSecret: string, sinceDays = 120
) {
  console.log('=== RECONCILING ITEM QUANTITIES FROM ZOHO ===')

  const accessToken = await getValidAccessToken(supabase, clientId, clientSecret)
  const orgId = await getOrgId(supabase)
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const authHeaders = { 'Authorization': `Zoho-oauthtoken ${accessToken}` }

  const zohoGet = async (path: string) => {
    const resp = await fetch(`${ZOHO_API_URL}/books/v3/${path}`, { headers: authHeaders })
    const data = await resp.json()
    if (data.code !== 0) throw new Error(data.message || `Zoho request failed: ${path}`)
    return data
  }
  const key = (v: unknown) => String(v ?? '').trim().toLowerCase()

  // 1. Active orders + every reference that can point at them
  const { data: activeOrders } = await supabase
    .from('orders')
    .select('id, order_number, reference')
    .not('status', 'in', '("completed","delivered")')

  const orderIds = (activeOrders || []).map((o: any) => o.id)
  if (!orderIds.length) {
    return new Response(JSON.stringify({ success: true, message: 'No active orders to reconcile' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  const refToOrders = new Map<string, string[]>()
  const addRef = (ref: unknown, id: string) => {
    const k = key(ref)
    if (!k) return
    refToOrders.set(k, [...new Set([...(refToOrders.get(k) || []), id])])
  }
  for (const o of activeOrders || []) {
    addRef(o.order_number, o.id)
    addRef(o.reference, o.id)
  }

  // App-linked supplier PO numbers also point at an order
  const { data: linkedPos } = await supabase
    .from('order_purchase_orders')
    .select('order_id, purchase_order_number')
    .in('order_id', orderIds)
  for (const l of linkedPos || []) addRef(l.purchase_order_number, l.order_id)

  const matchRefs = (refs: unknown[]) => {
    const ids = new Set<string>()
    for (const r of refs) (refToOrders.get(key(r)) || []).forEach(id => ids.add(id))
    return [...ids]
  }

  // 2. Reset counters so everything is rebuilt from Zoho.
  //    Manual completions (qty_completed) are user decisions Zoho knows nothing
  //    about, so snapshot them and restore after the rebuild.
  const { data: completedSnapshot } = await supabase
    .from('order_items')
    .select('id, qty_completed')
    .in('order_id', orderIds)
    .gt('qty_completed', 0)

  await supabase.from('order_item_po_allocations').delete().in('order_id', orderIds)
  await supabase
    .from('order_items')
    .update({ qty_on_po: 0, qty_received: 0, qty_invoiced: 0, qty_completed: 0, updated_at: new Date().toISOString() })
    .in('order_id', orderIds)

  // 3. Purchase orders -> "In Progress", plus billed/received qty -> "In Stock"
  let poAllocated = 0
  let poCount = 0
  let receivedUnits = 0
  const poList = await zohoGet(`purchaseorders?organization_id=${orgId}&date_after=${since}&per_page=200`)
  for (const summary of poList.purchaseorders || []) {
    if (String(summary.status || '').toLowerCase() === 'cancelled') continue
    if (!matchRefs([summary.reference_number, summary.purchaseorder_number]).length) continue

    const detail = await zohoGet(`purchaseorders/${summary.purchaseorder_id}?organization_id=${orgId}`)
    const po = detail.purchaseorder
    if (!po) continue

    const result = await allocatePurchaseOrder(supabase, po)
    poAllocated += result.allocated || 0
    poCount++

    // Anything already billed/received on the PO means the stock landed
    const receivedLines = (po.line_items || [])
      .map((l: any) => ({
        sku: l.sku || l.item_code,
        quantity: Math.max(Number(l.quantity_received || 0), Number(l.quantity_billed || 0)),
      }))
      .filter((l: any) => l.quantity > 0)

    if (receivedLines.length) {
      const r = await applyBillReceipt(supabase, {
        purchaseorder_id: String(po.purchaseorder_id),
        line_items: receivedLines,
      })
      receivedUnits += r.received || 0
    }
  }

  // 4. Customer invoices -> "Ready for Delivery"
  let invoiceUpdated = 0
  let invoiceCount = 0
  const invList = await zohoGet(`invoices?organization_id=${orgId}&date_after=${since}&per_page=200`)
  for (const inv of invList.invoices || []) {
    if (String(inv.status || '').toLowerCase() === 'void') continue
    const matchedIds = matchRefs([inv.reference_number, inv.purchase_order, (inv as any).purchaseorder_number])
    if (!matchedIds.length) continue

    const detail = await zohoGet(`invoices/${inv.invoice_id}?organization_id=${orgId}`)
    const lineItems = detail.invoice?.line_items || []
    const result = await applyInvoiceQuantities(supabase, matchedIds, lineItems)
    invoiceUpdated += result.updated || 0
    invoiceCount++
  }

  // 5. Restore manual completions (trigger caps them at qty_invoiced)
  for (const row of completedSnapshot || []) {
    await supabase
      .from('order_items')
      .update({ qty_completed: row.qty_completed, updated_at: new Date().toISOString() })
      .eq('id', row.id)
  }



  await supabase.from('zoho_sync_log').insert({
    sync_type: 'reconcile_quantities',
    status: 'completed',
    items_synced: poAllocated + invoiceUpdated,
    completed_at: new Date().toISOString(),
  })

  const summary = {
    success: true,
    orders_reset: orderIds.length,
    purchase_orders_matched: poCount,
    units_on_po: poAllocated,
    units_received: receivedUnits,
    invoices_matched: invoiceCount,
    units_invoiced: invoiceUpdated,
  }
  console.log('=== RECONCILE COMPLETE ===', JSON.stringify(summary))

  return new Response(JSON.stringify(summary), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}
