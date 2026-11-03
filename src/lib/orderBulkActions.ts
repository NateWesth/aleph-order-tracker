import { readAllRows } from "./readAllRows";

export const selectAllOrderIds = (orders: Array<{ id: string }>) => new Set(orders.map(order => order.id));
export function orderItemCounters(quantity: number, status: string) {
  const q = Math.max(0, quantity);
  return {
    qty_on_po: status === "ordered" ? 0 : q,
    qty_received: ["in-stock", "ready", "delivered"].includes(status) ? q : 0,
    qty_invoiced: ["ready", "delivered"].includes(status) ? q : 0,
    qty_completed: status === "delivered" ? q : 0,
  };
}

/** Check actual affected rows: RLS can silently turn a mutation into a no-op. */
export function verifyOrderMutation(ids: string[], rows: Array<{ id: string }> | null) {
  const affected = new Set((rows || []).map(row => row.id));
  const missing = [...new Set(ids)].filter(id => !affected.has(id));
  if (missing.length) throw new Error(`${missing.length} selected order(s) could not be changed. Your selection is kept; check your access and retry.`);
}

export async function mutateSelectedOrders(ids: string[], mutate: (batch: string[]) => PromiseLike<{ data: Array<{ id: string }> | null; error: { message: string } | null }>) {
  const unique = [...new Set(ids)];
  for (let start = 0; start < unique.length; start += 200) {
    const batch = unique.slice(start, start + 200);
    const { data, error } = await mutate(batch);
    if (error) throw new Error(error.message);
    verifyOrderMutation(batch, data);
  }
}

export async function updateSelectedOrderStatus(db: any, ids: string[], status: string) {
  if (!["ordered", "in-progress", "in-stock", "ready", "delivered"].includes(status)) throw new Error("Choose a valid order status.");
  for (const id of [...new Set(ids)]) {
    const items = await readAllRows<{ id: string; quantity: number }>((from, to) => db.from("order_items").select("id,quantity").eq("order_id", id).order("id").range(from, to));
    for (const item of items) {
      const { data, error } = await db.from("order_items").update({ ...orderItemCounters(item.quantity, status), updated_at: new Date().toISOString() }).eq("id", item.id).select("id");
      if (error) throw error;
      verifyOrderMutation([item.id], data);
    }
    const { data, error } = await db.from("orders").update({ status, completed_date: status === "delivered" ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq("id", id).select("id");
    if (error) throw error;
    verifyOrderMutation([id], data);
  }
}