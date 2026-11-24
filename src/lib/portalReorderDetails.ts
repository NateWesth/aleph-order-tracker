export type ReorderLine = { item_id: string; quantity: number };
export type ReorderItem = { id: string; order_id: string; name: string; code: string | null; description: string | null };

/** Resolve identity within the original order; quantities always come from the request. */
export function resolveReorderLines(sourceOrderId: string, lines: ReorderLine[], items: ReorderItem[]) {
  const byId = new Map(items.filter(item => item.order_id === sourceOrderId).map(item => [item.id, item]));
  return lines.map(line => ({ ...line, item: byId.get(line.item_id) ?? null }));
}