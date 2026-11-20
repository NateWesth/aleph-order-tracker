import { useEffect, useState } from "react";
import { TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { summarisePriceChange, type PriceChange, type PricePoint } from "@/lib/priceHistory";
import type { BuyingSheetRow } from "./types";

/** Flags Buying Sheet items whose latest supplier bill price rose against the previous bill. */
export default function SupplierPriceAlerts({ rows }: { rows: BuyingSheetRow[] }) {
  const [changes, setChanges] = useState<{ row: BuyingSheetRow; change: PriceChange }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = rows.filter(r => r.toOrder > 0 && !r.isMiscellaneous && r.sku).map(r => r.sku).sort().join("|");

  useEffect(() => {
    const skus = Array.from(new Set(key.split("|").filter(Boolean))).slice(0, 2000);
    if (!skus.length) { setChanges([]); return; }
    let live = true;
    (supabase.rpc as any)("get_supplier_price_history", { p_skus: skus }).then(({ data, error }: any) => {
      if (!live) return;
      if (error) { setError(error.message); return; }
      const bySku = new Map<string, PricePoint[]>();
      for (const d of data || []) {
        const list = bySku.get(d.sku) || [];
        list.push({ date: d.bill_date, rate: Number(d.unit_rate), vendor: d.vendor_name });
        bySku.set(d.sku, list);
      }
      const out: { row: BuyingSheetRow; change: PriceChange }[] = [];
      for (const row of rows) {
        const c = summarisePriceChange(bySku.get(row.sku.trim().toLowerCase()) || []);
        if (c && c.changePct >= 5 && row.toOrder > 0) out.push({ row, change: c });
      }
      setChanges(out.sort((a, b) => b.change.changePct - a.change.changePct));
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (error) return <p className="text-xs text-destructive">Supplier price history unavailable: {error}</p>;
  if (!changes?.length) return null;
  return (
    <div className="rounded-xl border border-destructive/25 bg-destructive/5 p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-bold"><TrendingUp className="h-4 w-4 text-destructive" />Supplier price increases<Badge variant="secondary">{changes.length}</Badge></div>
      <p className="mb-2 text-xs text-muted-foreground">Latest supplier bill price vs the previous bill (excl. VAT), for items you still need to order. Based on saved bills only.</p>
      <ul className="max-h-56 space-y-1 overflow-auto text-xs">
        {changes.slice(0, 50).map(({ row, change }) => (
          <li key={row.rowKey} className="flex flex-wrap justify-between gap-2 border-b border-border/40 pb-1">
            <span className="font-semibold">{row.sku} · {row.itemName}</span>
            <span>R{change.previous.rate.toFixed(2)} ({change.previous.date}) → R{change.latest.rate.toFixed(2)} ({change.latest.date}){change.latest.vendor ? ` · ${change.latest.vendor}` : ""} <strong className="text-destructive">+{change.changePct}%</strong></span>
          </li>
        ))}
      </ul>
    </div>
  );
}
