export interface PricePoint { date: string; rate: number; vendor: string | null }
export interface PriceChange { latest: PricePoint; previous: PricePoint; changePct: number }

/** Compare the latest dated bill rate against the previous different-date bill. */
export function summarisePriceChange(points: PricePoint[]): PriceChange | null {
  const sorted = [...points].filter(p => p.rate > 0 && p.date).sort((a, b) => b.date.localeCompare(a.date));
  const latest = sorted[0];
  const previous = sorted.find(p => p.date < (latest?.date ?? ""));
  if (!latest || !previous) return null;
  return { latest, previous, changePct: Math.round(((latest.rate - previous.rate) / previous.rate) * 1000) / 10 };
}
