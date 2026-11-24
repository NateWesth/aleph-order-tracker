import { readAllRows } from "./readAllRows";

export type ReorderLine = { item_id: string; quantity: number };
export type ReorderItem = { id: string; order_id: string; name: string; code: string | null; description: string | null };
export type ReorderRequest = { id: string; status: string; source_order_id: string; lines: ReorderLine[]; notes: string | null; created_at: string; companies: { name: string } | null; orders: { order_number: string } | null };

export async function readOrderItemsForOrders<T>(db: any, ids: string[], columns: string): Promise<T[]> {
  const unique = [...new Set(ids)];
  const result: T[] = [];
  for (let start = 0; start < unique.length; start += 100) {
    const batch = unique.slice(start, start + 100);
    result.push(...await readAllRows<T>((from, to) => db.from("order_items").select(columns).in("order_id", batch).order("id").range(from, to)));
  }
  return result;
}

export async function loadReorderDetails(db: any, status: string) {
  const requests = await readAllRows<ReorderRequest>((from, to) => db.from("portal_reorder_requests").select("*,companies(name),orders(order_number)").eq("status", status).order("created_at").order("id").range(from, to));
  const items = await readOrderItemsForOrders<ReorderItem>(db, requests.map(request => request.source_order_id), "id,order_id,name,code,description");
  return { requests, items };
}

/** Resolve identity within the original order; quantities always come from the request. */
export function resolveReorderLines(sourceOrderId: string, lines: ReorderLine[], items: ReorderItem[]) {
  const byId = new Map(items.filter(item => item.order_id === sourceOrderId).map(item => [item.id, item]));
  return lines.map(line => ({ ...line, item: byId.get(line.item_id) ?? null }));
}