import { useEffect, useMemo, useState } from 'react';
import { Package, Timer } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { depletionDays, freshStock, STOCK_WARNING_DAYS } from '@/lib/stockDepletion';
import type { BuyingSheetRow, SuggestedRestockRow, ZohoStockData } from './types';

export default function StockDepletionAlerts({ stock, rows, suggested }: { stock: ZohoStockData | null; rows: BuyingSheetRow[]; suggested: SuggestedRestockRow[] }) {
  const [warningDays, setWarningDays] = useState(STOCK_WARNING_DAYS);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(timer); }, []);
  const result = useMemo(() => {
    const demand = new Map<string, { sku: string; name: string; daily: number }>();
    for (const row of suggested) demand.set(row.sku, { sku: row.sku, name: row.itemName, daily: row.avgMonthlyQty / 30 });
    for (const row of rows) if (!row.isMiscellaneous) demand.set(row.sku, { sku: row.sku, name: row.itemName, daily: row.dailyBurnRate });
    let unknown = 0;
    const alerts = [];
    for (const item of demand.values()) {
      const entry = stock?.[item.sku];
      const quantity = freshStock(entry, now);
      if (quantity === null) { unknown++; continue; }
      const days = depletionDays(quantity, item.daily);
      if (days !== null && days <= warningDays) alerts.push({ ...item, quantity, days, updated: entry?.stockUpdatedAt });
    }
    return { unknown, alerts: alerts.sort((a, b) => a.days - b.days || a.sku.localeCompare(b.sku)) };
  }, [stock, rows, suggested, warningDays, now]);
  return <section className="min-w-0 border-t border-border py-4 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold"><Package className="h-4 w-4 text-primary" />Stock depletion<Badge variant="secondary">{result.alerts.length}</Badge></h2>
      <label className="flex items-center gap-2 text-xs text-muted-foreground">View within<Input aria-label="Stock view days" type="number" min={1} max={365} value={warningDays} onChange={event => { const value = Number(event.target.value); if (Number.isFinite(value)) setWarningDays(Math.min(365, Math.max(1, Math.round(value)))); }} className="h-8 w-20" />days</label>
    </div>
    <p className="text-xs text-muted-foreground">Automatic notifications: {STOCK_WARNING_DAYS} days · All approved staff</p>
    {result.unknown > 0 && <p role="status" className="text-xs text-muted-foreground">{result.unknown} items have missing or older-than-24-hour stock figures.</p>}
    {!result.alerts.length ? <p className="text-sm text-muted-foreground">{result.unknown ? 'No warnings confirmed from fresh stock.' : 'No stock depletion warnings.'}</p> : <ul className="max-h-72 overflow-y-auto divide-y divide-border">
      {result.alerts.map(item => <li key={item.sku} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
        <div className="min-w-0"><p className="font-medium break-words">{item.sku} · {item.name}</p><p className="text-muted-foreground">{item.quantity} on hand · {item.daily.toFixed(1)}/day{item.updated ? ` · Checked ${new Date(item.updated).toLocaleString()}` : ''}</p></div>
        <Badge variant={item.days <= 7 ? 'destructive' : 'outline'} className="gap-1"><Timer className="h-3 w-3" />{item.days === 0 ? 'Out of stock' : `~${item.days} days left`}</Badge>
      </li>)}
    </ul>}
  </section>;
}