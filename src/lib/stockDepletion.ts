export { freshStock } from '../../supabase/functions/_shared/inventory';
export const STOCK_WARNING_DAYS = 7;

/** Incoming POs are not on-hand inventory and must not extend depletion estimates. */
export function depletionDays(stock: number | null, dailyDemand: number): number | null {
  if (stock === null || !Number.isFinite(stock) || !Number.isFinite(dailyDemand) || dailyDemand <= 0) return null;
  return Math.max(0, Math.ceil(stock / dailyDemand));
}

export function isStockWarning(stock: number | null, dailyDemand: number): boolean {
  const days = depletionDays(stock, dailyDemand);
  return days !== null && days <= STOCK_WARNING_DAYS;
}