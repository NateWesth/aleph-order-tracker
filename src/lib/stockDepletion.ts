export { freshStock } from '../../supabase/functions/_shared/inventory';

/** Incoming POs are not on-hand inventory and must not extend depletion estimates. */
export function depletionDays(stock: number | null, dailyDemand: number): number | null {
  if (stock === null || !Number.isFinite(stock) || !Number.isFinite(dailyDemand) || dailyDemand <= 0) return null;
  return Math.max(0, Math.floor(stock / dailyDemand));
}