const BUYING_CACHE_ID = 'buying-sheet'
const PO_CACHE_ID = '00000000-0000-0000-0000-000000000003'
const EXCLUDED_PO_STATUSES = new Set(['cancelled', 'closed', 'rejected', 'draft', 'void'])
const EXCLUDED_RECEIVED_STATUSES = new Set(['received', 'fully_received'])
const CACHE_MUTATION_LOCK = 'zoho-event-cache-mutation'
const COLLECTION_RETENTION_DAYS = 21

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function isWithinCollectionRetention(value: unknown): boolean {
  const timestamp = new Date(String(value || '')).getTime()
  const cutoff = new Date()
  cutoff.setUTCHours(0, 0, 0, 0)
  cutoff.setUTCDate(cutoff.getUTCDate() - COLLECTION_RETENTION_DAYS)
  return Number.isFinite(timestamp) && timestamp >= cutoff.getTime()
}

async function withCacheMutationLock<T>(supabase: any, mutate: () => Promise<T>): Promise<T> {
  let acquired = false
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const { data, error } = await supabase.rpc('try_acquire_zoho_sync_lock', {
      requested_key: CACHE_MUTATION_LOCK,
      lease_seconds: 30,
    })
    if (error) throw error
    if (data === true) {
      acquired = true
      break
    }
    await delay(100 + attempt * 25)
  }

  if (!acquired) throw new Error('Timed out waiting to update the shared Zoho cache')

  try {
    return await mutate()
  } finally {
    await supabase.rpc('release_zoho_sync_lock', { requested_key: CACHE_MUTATION_LOCK })
  }
}

export type ZohoDocumentType = 'invoice' | 'purchase_order' | 'bill' | 'sales_order' | 'vendor' | 'item'

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function eventOperation(payload: any): string {
  return String(payload.operation || payload.event_type || payload.event || payload.action || payload.data?.operation || 'changed').toLowerCase()
}

function sourceModifiedAt(payload: any): string | null {
  return payload.last_modified_time || payload.updated_time || payload.modified_time ||
    payload.data?.last_modified_time || payload.data?.updated_time || null
}

export async function reserveWebhookEvent(
  supabase: any,
  payload: any,
  documentType: ZohoDocumentType,
  documentId: string,
) {
  const operation = eventOperation(payload)
  const explicitEventId = payload.event_id || payload.delivery_id || payload.data?.event_id || payload.event?.id
  const modified = sourceModifiedAt(payload)
  const payloadHash = await sha256(stableStringify(payload))
  // Prefer the document version over a delivery id: providers can assign a new
  // delivery id to the same retry, while the document's modified timestamp is
  // stable. This prevents a retry from spending another Zoho detail request.
  const dedupeKey = modified
    ? `document:${documentType}:${documentId}:${operation}:${modified}`
    : explicitEventId
      ? `event:${explicitEventId}`
      : `document:${documentType}:${documentId}:${operation}:${payloadHash}`

  const { data, error } = await supabase
    .from('zoho_webhook_events')
    .insert({
      dedupe_key: dedupeKey,
      event_type: String(payload.event_type || payload.event || ''),
      document_type: documentType,
      document_id: documentId,
      operation,
      payload,
      status: 'processing',
    })
    .select('id')
    .single()

  if (!error) return { accepted: true, id: data.id as string, dedupeKey }
  if (error.code !== '23505') throw error

  const { data: existing } = await supabase
    .from('zoho_webhook_events')
    .select('id, status, received_at')
    .eq('dedupe_key', dedupeKey)
    .maybeSingle()

  // A failed delivery may be retried; completed/in-flight duplicates return
  // immediately and never spend another Zoho API call.
  const processingExpired = existing?.status === 'processing' &&
    new Date(existing.received_at).getTime() < Date.now() - 5 * 60 * 1000
  if (existing?.status === 'failed' || processingExpired) {
    const { data: claimed } = await supabase
      .from('zoho_webhook_events')
      .update({ status: 'processing', error_message: null, received_at: new Date().toISOString(), processed_at: null })
      .eq('id', existing.id)
      .eq('status', existing.status)
      .select('id')
      .maybeSingle()
    if (claimed?.id) return { accepted: true, id: claimed.id as string, dedupeKey }
  }

  return { accepted: false, id: existing?.id as string | undefined, dedupeKey }
}

export async function completeWebhookEvent(supabase: any, id: string | undefined) {
  if (!id) return
  await supabase
    .from('zoho_webhook_events')
    .update({ status: 'completed', processed_at: new Date().toISOString(), error_message: null })
    .eq('id', id)
}

export async function failWebhookEvent(supabase: any, id: string | undefined, error: unknown) {
  if (!id) return
  await supabase
    .from('zoho_webhook_events')
    .update({
      status: 'failed',
      processed_at: new Date().toISOString(),
      error_message: error instanceof Error ? error.message : String(error),
    })
    .eq('id', id)
}

export async function cacheZohoDocument(
  supabase: any,
  organizationId: string,
  documentType: ZohoDocumentType,
  documentId: string,
  payload: any,
) {
  const payloadHash = await sha256(stableStringify(payload))
  const { data: previous } = await supabase
    .from('zoho_document_cache')
    .select('payload, payload_hash')
    .eq('organization_id', organizationId)
    .eq('document_type', documentType)
    .eq('document_id', documentId)
    .maybeSingle()

  if (previous?.payload_hash === payloadHash) {
    return { previous: previous.payload, unchanged: true }
  }

  const modified = payload.last_modified_time || payload.updated_time || payload.modified_time || null
  const { error } = await supabase.from('zoho_document_cache').upsert({
    organization_id: organizationId,
    document_type: documentType,
    document_id: documentId,
    payload,
    payload_hash: payloadHash,
    source_modified_at: modified,
    synced_at: new Date().toISOString(),
  })
  if (error) throw error
  return { previous: previous?.payload || null, unchanged: false }
}

function skuOf(line: any): string {
  return String(line?.sku || line?.item_code || '').trim().toUpperCase()
}

function excludedSku(sku: string): boolean {
  return !sku || sku.startsWith('SH-') || sku.startsWith('ZSH')
}

// Collection POs may legitimately contain descriptive lines with no SKU.
// Only shipping/service SKUs are excluded from the collection queue.
function excludedCollectionSku(sku: string): boolean {
  return sku.startsWith('SH-') || sku.startsWith('ZSH')
}

function poOutstandingBySku(po: any): Map<string, number> {
  const result = new Map<string, number>()
  const status = String(po?.status || '').toLowerCase()
  const billedStatus = String(po?.billed_status || '').toLowerCase()
  if (EXCLUDED_PO_STATUSES.has(status) || billedStatus === 'billed') return result

  for (const line of Array.isArray(po?.line_items) ? po.line_items : []) {
    const sku = skuOf(line)
    if (excludedSku(sku)) continue
    const quantity = Number(line.quantity || 0)
    const billed = Number(line.quantity_billed || 0)
    const outstanding = Math.max(0, quantity - billed)
    if (outstanding > 0) result.set(sku, (result.get(sku) || 0) + outstanding)
  }
  return result
}

function normalizePurchaseOrder(po: any) {
  const status = String(po.status || '').trim().toLowerCase()
  const billedStatus = String(po.billed_status || '').trim().toLowerCase()
  const receivedStatus = String(po.received_status || '').trim().toLowerCase()
  const purchaseOrderDate = po.date || po.purchaseorder_date
  const lines = (Array.isArray(po.line_items) ? po.line_items : [])
    .map((line: any) => {
      const sku = skuOf(line)
      const quantity = Number(line.quantity || 0)
      const quantityReceived = Number(line.quantity_received ?? line.received_quantity ?? 0)
      const quantityBilled = Number(line.quantity_billed ?? line.billed_quantity ?? 0)
      return {
        sku,
        name: String(line.name || line.item_name || ''),
        description: String(line.description || line.item_description || line.item_details || line.notes || '').trim(),
        quantity,
        quantityReceived,
        quantityBilled,
        // The fulfillment collection cache tracks physical stock, not whether
        // accounts payable has processed the supplier invoice.
        outstanding: Math.max(0, quantity - quantityReceived),
        rate: Number(line.rate || 0),
      }
    })
    .filter((line: any) => !excludedCollectionSku(line.sku) && line.outstanding > 0)

  if (
    !String(po.purchaseorder_id || '') ||
    EXCLUDED_PO_STATUSES.has(status) ||
    EXCLUDED_RECEIVED_STATUSES.has(receivedStatus) ||
    lines.length === 0
  ) return null

  return {
    purchaseOrderId: String(po.purchaseorder_id || ''),
    purchaseOrderNumber: String(po.purchaseorder_number || ''),
    vendorId: String(po.vendor_id || ''),
    vendorName: String(po.vendor_name || 'Unknown supplier'),
    vendorEmail: String(po.vendor_email || ''),
    date: String(purchaseOrderDate || ''),
    expectedDeliveryDate: po.delivery_date || po.expected_delivery_date || null,
    status,
    receivedStatus,
    billedStatus,
    total: Number(po.total || 0),
    outstandingValue: Math.round(lines.reduce((sum: number, line: any) => sum + line.outstanding * line.rate, 0) * 100) / 100,
    lines,
  }
}

async function updateCachesFromPurchaseOrderUnlocked(supabase: any, previous: any, purchaseOrder: any) {
  const previousBySku = poOutstandingBySku(previous)
  const nextBySku = poOutstandingBySku(purchaseOrder)
  const changedSkus = new Set([...previousBySku.keys(), ...nextBySku.keys()])
  const now = new Date().toISOString()

  const { data: buyingRow } = await supabase
    .from('buying_sheet_cache')
    .select('payload')
    .eq('id', BUYING_CACHE_ID)
    .maybeSingle()
  const buyingPayload = { ...(buyingRow?.payload || {}) }

  for (const sku of changedSkus) {
    const current = buyingPayload[sku] || {}
    const delta = (nextBySku.get(sku) || 0) - (previousBySku.get(sku) || 0)
    buyingPayload[sku] = {
      stockOnHand: Number(current.stockOnHand || 0),
      onPurchaseOrder: Math.max(0, Number(current.onPurchaseOrder || 0) + delta),
      vendorName: purchaseOrder.vendor_name || current.vendorName || '',
      vendorEmail: purchaseOrder.vendor_email || current.vendorEmail || '',
      unitCost: current.unitCost ?? null,
      lastPurchasedDate: current.lastPurchasedDate ?? null,
      lastPurchasedQty: current.lastPurchasedQty ?? null,
      costSource: current.costSource ?? null,
    }
  }

  if (changedSkus.size > 0) {
    await supabase.from('buying_sheet_cache').upsert({ id: BUYING_CACHE_ID, payload: buyingPayload, fetched_at: now })
  }

  const { data: poRow } = await supabase
    .from('po_tracking_cache')
    .select('payload')
    .eq('id', PO_CACHE_ID)
    .maybeSingle()
  const purchaseOrders = Array.isArray(poRow?.payload)
    ? [...poRow.payload]
    : []
  const id = String(purchaseOrder.purchaseorder_id || '')
  const withoutCurrent = purchaseOrders.filter((po: any) => String(po.purchaseOrderId) !== id)
  const normalized = normalizePurchaseOrder(purchaseOrder)
  if (normalized) withoutCurrent.push(normalized)
  withoutCurrent.sort((a: any, b: any) => String(b.date).localeCompare(String(a.date)))
  await supabase.from('po_tracking_cache').upsert({ id: PO_CACHE_ID, payload: withoutCurrent, fetched_at: now })
}

export async function updateCachesFromPurchaseOrder(supabase: any, previous: any, purchaseOrder: any) {
  return withCacheMutationLock(supabase, () => updateCachesFromPurchaseOrderUnlocked(supabase, previous, purchaseOrder))
}

async function updateCachesFromBillUnlocked(supabase: any, bill: any) {
  const now = new Date().toISOString()
  const billDate = String(bill.date || bill.bill_date || now)
  const { data: buyingRow } = await supabase
    .from('buying_sheet_cache')
    .select('payload')
    .eq('id', BUYING_CACHE_ID)
    .maybeSingle()
  const buyingPayload = { ...(buyingRow?.payload || {}) }

  for (const line of Array.isArray(bill.line_items) ? bill.line_items : []) {
    const sku = skuOf(line)
    if (excludedSku(sku)) continue
    const current = buyingPayload[sku] || {}
    const currentDate = current.lastPurchasedDate ? new Date(current.lastPurchasedDate).getTime() : 0
    if (new Date(billDate).getTime() < currentDate) continue
    buyingPayload[sku] = {
      stockOnHand: Number(current.stockOnHand || 0),
      onPurchaseOrder: Number(current.onPurchaseOrder || 0),
      vendorName: bill.vendor_name || current.vendorName || '',
      vendorEmail: bill.vendor_email || current.vendorEmail || '',
      unitCost: Number(line.rate ?? line.item_total / Math.max(1, Number(line.quantity || 1))) || current.unitCost || null,
      lastPurchasedDate: billDate,
      lastPurchasedQty: Number(line.quantity || 0),
      costSource: 'bill',
    }
  }
  await supabase.from('buying_sheet_cache').upsert({ id: BUYING_CACHE_ID, payload: buyingPayload, fetched_at: now })
}

export async function updateCachesFromBill(supabase: any, bill: any) {
  return withCacheMutationLock(supabase, () => updateCachesFromBillUnlocked(supabase, bill))
}

async function updateCacheFromItemUnlocked(supabase: any, item: any) {
  const sku = skuOf(item)
  if (excludedSku(sku)) return
  const { data: row } = await supabase
    .from('buying_sheet_cache')
    .select('payload')
    .eq('id', BUYING_CACHE_ID)
    .maybeSingle()
  const payload = { ...(row?.payload || {}) }
  const current = payload[sku] || {}
  payload[sku] = {
    stockOnHand: Number(item.stock_on_hand ?? item.actual_available_stock ?? item.available_stock ?? current.stockOnHand ?? 0),
    onPurchaseOrder: Number(current.onPurchaseOrder || 0),
    vendorName: item.vendor_name || current.vendorName || '',
    vendorEmail: current.vendorEmail || '',
    unitCost: Number(item.purchase_rate ?? current.unitCost) || null,
    lastPurchasedDate: current.lastPurchasedDate ?? null,
    lastPurchasedQty: current.lastPurchasedQty ?? null,
    costSource: current.costSource || (item.purchase_rate ? 'item' : null),
  }
  await supabase.from('buying_sheet_cache').upsert({ id: BUYING_CACHE_ID, payload, fetched_at: new Date().toISOString() })
}

export async function updateCacheFromItem(supabase: any, item: any) {
  return withCacheMutationLock(supabase, () => updateCacheFromItemUnlocked(supabase, item))
}

function formatAddress(address: any): string | null {
  if (!address) return null
  return [address.address, address.street2, address.city, address.state, address.zip, address.country].filter(Boolean).join(', ') || null
}

export async function upsertVendorFromContact(supabase: any, contact: any) {
  if (String(contact.contact_type || '').toLowerCase() !== 'vendor') return
  const zohoId = String(contact.contact_id || '')
  if (!zohoId) return
  const name = contact.company_name || contact.contact_name || 'Unnamed Vendor'
  const payload = {
    name,
    code: String(contact.contact_number || contact.vendor_number || '').trim() || `ZV-${zohoId}`,
    zoho_contact_id: zohoId,
    contact_person: contact.contact_name || null,
    email: contact.email || contact.contact_persons?.[0]?.email || null,
    phone: contact.phone || contact.mobile || null,
    address: formatAddress(contact.billing_address),
  }
  const { data: existing } = await supabase
    .from('suppliers')
    .select('id')
    .eq('zoho_contact_id', zohoId)
    .maybeSingle()
  if (existing?.id) await supabase.from('suppliers').update(payload).eq('id', existing.id)
  else await supabase.from('suppliers').insert(payload)
}
