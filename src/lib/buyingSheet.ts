/** Only units still awaiting receipt belong in the procurement requirement. */
export function buyingRequirement(line: { quantity: number; qty_received?: number | null; qty_on_po?: number | null }) {
  const quantity = Math.max(0, line.quantity || 0);
  const received = Math.min(quantity, Math.max(0, line.qty_received || 0));
  const totalNeeded = quantity - received;
  return { totalNeeded, allocatedOnPurchaseOrder: Math.min(totalNeeded, Math.max(0, (line.qty_on_po || 0) - received)) };
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