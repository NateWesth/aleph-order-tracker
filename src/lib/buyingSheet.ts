/**
 * Only units not yet received from the supplier AND not yet invoiced to the
 * customer belong in the procurement requirement. Invoiced units have already
 * left the building, so they can never need purchasing again.
 */
export function buyingRequirement(line: { quantity: number; qty_received?: number | null; qty_on_po?: number | null }, invoiced = 0) {
  const quantity = Math.max(0, line.quantity || 0);
  const received = Math.min(quantity, Math.max(0, line.qty_received || 0));
  const fulfilled = Math.max(received, Math.min(quantity, Math.max(0, invoiced || 0)));
  const totalNeeded = quantity - fulfilled;
  return { totalNeeded, allocatedOnPurchaseOrder: Math.min(totalNeeded, Math.max(0, (line.qty_on_po || 0) - received)) };
}

/** A shared quantity pool (invoiced units per order+SKU, or open PO units per SKU) consumed line by line so nothing is counted twice. */
export function createQuantityPool(entries: Iterable<[string, number]>) {
  const remaining = new Map<string, number>();
  for (const [key, qty] of entries) remaining.set(key, (remaining.get(key) || 0) + Math.max(0, Number(qty) || 0));
  return {
    take(key: string, wanted: number) {
      const available = remaining.get(key) || 0;
      const taken = Math.min(available, Math.max(0, wanted));
      if (taken > 0) remaining.set(key, available - taken);
      return taken;
    },
    left: (key: string) => remaining.get(key) || 0,
  };
}

export function isOpenBuyingOrder(order: { status?: string | null; completed_date?: string | null }) {
  return !order.completed_date && !["delivered", "completed", "cancelled", "canceled"].includes((order.status || "").toLowerCase());
}

/** Unknown stock is never invented; stale/missing snapshots are flagged separately. */
export function buyingShortfall(needed: number, stock: number, allocated: number) {
  return Math.max(0, needed - Math.max(0, stock || 0) - Math.max(0, allocated || 0));
}

export function buyingOrderQuantity(row: { rowKey: string; recommendedOrderQty: number }, overrides: Record<string, number>) {
  return overrides[row.rowKey] ?? row.recommendedOrderQty;
}

export function allocateBuyingQuantity(lines: Array<{ id: string; quantity: number; qty_on_po: number }>, purchased: number) {
  let remaining = Math.max(0, purchased);
  return lines.flatMap(line => {
    const added = Math.min(Math.max(0, line.quantity - line.qty_on_po), remaining);
    remaining -= added;
    return added > 0 ? [{ ...line, nextQtyOnPO: line.qty_on_po + added }] : [];
  });
}