export const STOCK_MAX_AGE_MS = 86_400_000;

export function readStock(item: Record<string, unknown>): number | null {
  const raw = item.stock_on_hand ?? item.actual_available_stock ?? item.available_stock;
  if (raw === null || raw === undefined || raw === '' || typeof raw === 'boolean') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export function freshStock(entry: { stockOnHand?: number | null; stockUpdatedAt?: string | null } | undefined, now = Date.now()): number | null {
  if (!entry || typeof entry.stockOnHand !== 'number' || !Number.isFinite(entry.stockOnHand)) return null;
  const updated = Date.parse(entry.stockUpdatedAt || '');
  return Number.isFinite(updated) && updated <= now && now - updated <= STOCK_MAX_AGE_MS ? entry.stockOnHand : null;
}

/** Merge only inventory, retaining vendor costs and newer webhook observations. */
export function mergeInventory(current: Record<string, any>, inventory: Record<string, { stockOnHand: number | null; itemName: string }>, observedAt: string) {
  const result = { ...current };
  for (const sku of new Set([...Object.keys(current), ...Object.keys(inventory)])) {
    const previous = current[sku] || {};
    if (Date.parse(previous.stockUpdatedAt || '') > Date.parse(observedAt)) continue;
    result[sku] = {
      ...previous,
      onPurchaseOrder: previous.onPurchaseOrder ?? 0,
      itemName: inventory[sku]?.itemName || previous.itemName || sku,
      stockOnHand: inventory[sku]?.stockOnHand ?? null,
      stockUpdatedAt: inventory[sku]?.stockOnHand != null ? observedAt : null,
    };
  }
  return result;
}