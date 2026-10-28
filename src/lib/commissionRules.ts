// Commission profit-split rules. Mirrored in supabase/functions/rep-commission-data.
export type CommissionMethod =
  | "profit_split_60"
  | "profit_split_28"
  | "margin_scaled"
  | "half_markup_below_25";

export const PROFIT_SPLIT_THRESHOLD = 25; // markup on cost, %
export const LOW_MARKUP_REP_SHARE = 0.5;

export const PROFIT_SPLIT_COST_CAP: Record<"profit_split_60" | "profit_split_28", number> = {
  profit_split_60: 0.15,
  profit_split_28: 0.07,
};

export const PROFIT_SPLIT_SHARE: Record<"profit_split_60" | "profit_split_28", number> = {
  profit_split_60: 0.6,
  profit_split_28: 0.28,
};

export const COMMISSION_METHOD_LABEL: Record<CommissionMethod, string> = {
  profit_split_60: "60 / 40 · capped at 15% of cost",
  profit_split_28: "28 / 72 · capped at 7% of cost",
  margin_scaled: "Margin-scaled (legacy)",
  half_markup_below_25: "Half-markup (legacy)",
};

export const isProfitSplit = (m: string | null | undefined): m is "profit_split_60" | "profit_split_28" =>
  m === "profit_split_60" || m === "profit_split_28";

/** Capped rep share of line profit. Returns 0 for unknown/zero cost or no profit. */
export function profitSplitCommission(
  method: "profit_split_60" | "profit_split_28",
  sellRate: number,
  cost: number | null,
  qty: number,
): { commission: number; repShare: number; markupPct: number | null } {
  if (cost == null || cost <= 0 || sellRate <= 0) return { commission: 0, repShare: 0, markupPct: null };
  const markupPct = ((sellRate - cost) / cost) * 100;
  const profit = (sellRate - cost) * qty;
  if (profit <= 0) return { commission: 0, repShare: 0, markupPct };
  const highMarkup = markupPct >= PROFIT_SPLIT_THRESHOLD;
  const share = highMarkup ? PROFIT_SPLIT_SHARE[method] : LOW_MARKUP_REP_SHARE;
  const commission = highMarkup
    ? Math.min(profit * share, cost * qty * PROFIT_SPLIT_COST_CAP[method])
    : profit * share;
  return { commission, repShare: commission / profit, markupPct };
}
