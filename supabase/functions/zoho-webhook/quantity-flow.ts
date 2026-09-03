// Item-level quantity flow helpers.
//
// Each order_items row carries four cumulative counters:
//   qty_on_po     -> quantity covered by a supplier purchase order  ("In Progress")
//   qty_received  -> quantity actually received (vendor bill on PO) ("In Stock")
//   qty_invoiced  -> quantity invoiced to the customer              ("Ready for Delivery")
//   qty_completed -> quantity delivered/closed                      ("Completed")
//
// Buckets shown on the board are the differences between these counters, so a
// single order line can appear in several columns at once.

export const norm = (v: unknown) => String(v ?? '').trim().toLowerCase()

type Supa = any

export async function findOrderIdsForReferences(supabase: Supa, refs: string[]): Promise<string[]> {
  const ids = new Set<string>()
  for (const raw of refs) {
    const ref = String(raw || '').trim()
    if (!ref) continue

    const { data: byNumber } = await supabase
      .from('orders').select('id').ilike('order_number', ref)
    byNumber?.forEach((o: any) => ids.add(o.id))

    const { data: byRef } = await supabase
      .from('orders').select('id').ilike('reference', ref)
    byRef?.forEach((o: any) => ids.add(o.id))
  }
  return [...ids]
}

/** Orders that have this PO number linked inside the app. */
export async function findOrderIdsForPoNumber(supabase: Supa, poNumber: string): Promise<string[]> {
  if (!poNumber) return []
  const { data } = await supabase
    .from('order_purchase_orders')
    .select('order_id')
    .ilike('purchase_order_number', poNumber)
  return [...new Set((data || []).map((r: any) => r.order_id))] as string[]
}

async function loadItems(supabase: Supa, orderIds: string[]) {
  if (!orderIds.length) return []
  const { data } = await supabase
    .from('order_items')
    .select('id, order_id, name, code, description, notes, quantity, qty_on_po, qty_received, qty_invoiced, qty_completed, created_at')
    .in('order_id', orderIds)
    .order('created_at', { ascending: true })
  return data || []
}

export const isExcludedSku = (sku: unknown) => {
  const s = norm(sku)
  return s.startsWith('sh-') || s.startsWith('zsh')
}

/**
 * Match score for a line against an order item.
 *   2 = exact SKU match, 1 = exact name match, 0 = no match.
 * Name matching is always allowed as a fallback, because Zoho invoices often
 * carry a different SKU (or none) to the one stored on the order line.
 */
const matchScore = (item: any, sku: string, name: string) => {
  const code = norm(item.code)
  if (sku && code && code === sku) return 2
  const itemName = norm(item.name)
  if (name && itemName && (itemName === name || itemName.startsWith(name) || name.startsWith(itemName))) return 1
  return 0
}

/** Items that can take this line, best match first. */
const candidates = (items: any[], sku: string, name: string) =>
  items
    .map((item, idx) => ({ item, score: matchScore(item, sku, name), idx }))
    .filter(c => c.score > 0)
    .sort((a, b) => b.score - a.score || a.idx - b.idx)
    .map(c => c.item)

/**
 * Spreads purchase-order line quantities across the matching customer order
 * items that still have quantity awaiting stock (oldest order line first).
 */
export async function allocatePurchaseOrder(supabase: Supa, po: any) {
  const poNumber = po.purchaseorder_number || po.purchase_order_number || ''
  const poId = String(po.purchaseorder_id || po.purchase_order_id || '')
  const vendorName = po.vendor_name || ''

  const linkedIds = await findOrderIdsForPoNumber(supabase, poNumber)
  const refIds = await findOrderIdsForReferences(supabase, [po.reference_number, po.reference, poNumber])
  const orderIds = [...new Set([...linkedIds, ...refIds])]

  if (!orderIds.length) {
    return { allocated: 0, orders: [] as string[], reason: 'no matching orders' }
  }

  const items = await loadItems(supabase, orderIds)
  const lineItems = Array.isArray(po.line_items) ? po.line_items : []
  let allocated = 0

  for (const line of lineItems) {
    const sku = norm(line.sku || line.item_code)
    const poDescription = String(line.description || line.item_description || line.item_details || line.notes || '').trim()
    const name = norm(line.name || line.item_name || poDescription)
    let remaining = Math.round(Number(line.quantity || 0))
    if (remaining <= 0) continue

    // How much of this PO line was already allocated previously (idempotency).
    const { data: existing } = await supabase
      .from('order_item_po_allocations')
      .select('id, order_item_id, quantity_ordered')
      .eq('zoho_purchaseorder_id', poId)
      .eq('sku', sku)
    const alreadyAllocated = (existing || []).reduce((s: number, r: any) => s + (r.quantity_ordered || 0), 0)
    remaining -= alreadyAllocated
    if (remaining <= 0) continue

    for (const item of candidates(items, sku, name)) {
      if (remaining <= 0) break

      const awaiting = Math.max(0, (item.quantity || 0) - (item.qty_on_po || 0))
      if (awaiting <= 0) continue

      const take = Math.min(awaiting, remaining)
      const genericLine = sku.startsWith('m-misc') || sku === 'misc' || sku === 'miscellaneous' || norm(item.name).startsWith('m-misc')
      const descriptionFromPO = poDescription && (genericLine || !String(item.description || '').trim())
        ? poDescription
        : item.description
      const { error } = await supabase
        .from('order_items')
        .update({ qty_on_po: (item.qty_on_po || 0) + take, description: descriptionFromPO || null, updated_at: new Date().toISOString() })
        .eq('id', item.id)
      if (error) {
        console.error('Failed to allocate PO qty to item', item.id, error)
        continue
      }

      item.qty_on_po = (item.qty_on_po || 0) + take
      remaining -= take
      allocated += take

      await supabase.from('order_item_po_allocations').insert({
        order_item_id: item.id,
        order_id: item.order_id,
        sku: sku || norm(item.code),
        zoho_purchaseorder_id: poId,
        purchase_order_number: poNumber,
        vendor_name: vendorName,
        quantity_ordered: take,
        quantity_received: 0,
      })
    }
  }

  return { allocated, orders: orderIds, po_number: poNumber }
}

/**
 * A vendor bill against a PO means the stock arrived: move the billed
 * quantities from "In Progress" into "In Stock".
 */
export async function applyBillReceipt(supabase: Supa, bill: any) {
  const lineItems = Array.isArray(bill.line_items) ? bill.line_items : []
  let received = 0

  for (const line of lineItems) {
    const sku = norm(line.sku || line.item_code)
    let remaining = Math.round(Number(line.quantity || 0))
    if (remaining <= 0) continue

    const poId = String(line.purchaseorder_id || bill.purchaseorder_id || '')

    let query = supabase
      .from('order_item_po_allocations')
      .select('id, order_item_id, quantity_ordered, quantity_received')
      .order('created_at', { ascending: true })

    if (poId) query = query.eq('zoho_purchaseorder_id', poId)
    if (sku) query = query.eq('sku', sku)

    const { data: allocations } = await query
    for (const alloc of allocations || []) {
      if (remaining <= 0) break
      const outstanding = (alloc.quantity_ordered || 0) - (alloc.quantity_received || 0)
      if (outstanding <= 0) continue

      const take = Math.min(outstanding, remaining)

      const { data: item } = await supabase
        .from('order_items')
        .select('id, qty_received, qty_on_po')
        .eq('id', alloc.order_item_id)
        .maybeSingle()
      if (!item) continue

      const nextReceived = Math.min((item.qty_received || 0) + take, item.qty_on_po || 0)
      await supabase
        .from('order_items')
        .update({ qty_received: nextReceived, updated_at: new Date().toISOString() })
        .eq('id', item.id)

      await supabase
        .from('order_item_po_allocations')
        .update({ quantity_received: (alloc.quantity_received || 0) + take })
        .eq('id', alloc.id)

      remaining -= take
      received += take
    }
  }

  return { received }
}

/**
 * An invoice moves only the invoiced quantities of the invoiced SKUs into
 * "Ready for Delivery" — never the whole order.
 */
export async function applyInvoiceQuantities(supabase: Supa, orderIds: string[], invoiceLineItems: any[]) {
  const items = await loadItems(supabase, orderIds)
  let updated = 0

  for (const line of invoiceLineItems || []) {
    const sku = norm(line.sku || line.item_code)
    const name = norm(line.name || line.item_name || line.description)
    let remaining = Math.round(Number(line.quantity || 0))
    if (remaining <= 0) continue

    for (const item of candidates(items, sku, name)) {
      if (remaining <= 0) break

      const invoiceable = Math.max(0, (item.quantity || 0) - (item.qty_invoiced || 0))
      if (invoiceable <= 0) continue

      const take = Math.min(invoiceable, remaining)
      const nextInvoiced = (item.qty_invoiced || 0) + take
      // Invoicing implies the stock existed: pull the earlier counters along.
      const nextOnPo = Math.max(item.qty_on_po || 0, nextInvoiced)
      const nextReceived = Math.max(item.qty_received || 0, nextInvoiced)

      const { error } = await supabase
        .from('order_items')
        .update({
          qty_on_po: nextOnPo,
          qty_received: nextReceived,
          qty_invoiced: nextInvoiced,
          updated_at: new Date().toISOString(),
        })
        .eq('id', item.id)

      if (error) {
        console.error('Failed to apply invoice qty to item', item.id, error)
        continue
      }

      item.qty_on_po = nextOnPo
      item.qty_received = nextReceived
      item.qty_invoiced = nextInvoiced
      remaining -= take
      updated += take
    }
  }

  return { updated }
}
