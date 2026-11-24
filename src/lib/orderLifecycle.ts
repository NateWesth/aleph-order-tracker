export type OrderLifecycle = { status?: string | null; completed_date?: string | null };
export const isOrderHistory = (order: OrderLifecycle) => Boolean(order.completed_date) || ['completed', 'delivered'].includes((order.status ?? '').trim().toLowerCase());
export const isActiveOrder = (order: OrderLifecycle) => !isOrderHistory(order) && !['cancelled', 'canceled'].includes((order.status ?? '').trim().toLowerCase());
export type QuantityLine = { quantity: number; totalQuantity?: number; qty_on_po?: number | null; qty_received?: number | null; qty_invoiced?: number | null; qty_completed?: number | null; progress_stage?: string | null };
export const isFullyCompleted = (items: QuantityLine[]) => items.some(i => i.quantity > 0) && items.every(i => i.quantity <= 0 || (i.qty_completed ?? 0) >= (i.totalQuantity ?? i.quantity));
export function orderItemBuckets(item: QuantityLine) {
  const qty = Math.max(0, item.totalQuantity ?? item.quantity ?? 0);
  const cap = (n: number | null | undefined) => Math.min(qty, Math.max(0, n ?? 0));
  const completed = cap(item.qty_completed);
  const invoiced = Math.max(completed, cap(item.qty_invoiced));
  const received = Math.max(invoiced, cap(item.qty_received));
  const onPo = Math.max(received, cap(item.qty_on_po));
  return { 'awaiting-stock': qty - onPo, ordered: onPo - received, 'in-stock': received - invoiced, 'ready-for-delivery': invoiced - completed, completed };
}