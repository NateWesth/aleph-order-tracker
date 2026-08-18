import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, Boxes, CircleDollarSign, Clock3, PackageCheck, ShieldAlert, Truck } from "lucide-react";

interface SummaryProps {
  totals: { needed: number; inStock: number; onPO: number; toOrder: number; urgent: number; stockoutRisk: number; estimatedCost: number; abcA: number };
  avgDaysWaiting: number;
  supplierCount: number;
}

function Metric({ label, value, icon: Icon, tone = "neutral" }: { label: string; value: string | number; icon: typeof Boxes; tone?: "neutral" | "primary" | "danger" | "success" }) {
  const tones = {
    neutral: "bg-card text-foreground",
    primary: "bg-primary/8 text-primary border-primary/20",
    danger: "bg-destructive/8 text-destructive border-destructive/20",
    success: "bg-emerald-500/8 text-emerald-600 border-emerald-500/20 dark:text-emerald-400",
  };
  return (
    <Card className={`buying-metric-card overflow-hidden rounded-[22px] border shadow-none ${tones[tone]}`}>
      <CardContent className="flex h-full items-center gap-3 p-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-current/10"><Icon className="h-5 w-5" /></span>
        <div className="min-w-0">
          <p className="text-[9px] font-black uppercase tracking-[0.16em] opacity-65">{label}</p>
          <p className="mt-1 truncate text-xl font-black tracking-tight">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function BuyingSheetSummary({ totals, avgDaysWaiting, supplierCount }: SummaryProps) {
  const coverage = totals.needed > 0 ? Math.min(100, Math.round(((totals.inStock + totals.onPO) / totals.needed) * 100)) : 100;

  return (
    <div className="buying-summary-mosaic grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Card className="buying-order-hero relative overflow-hidden rounded-[26px] border-primary/20 bg-primary text-primary-foreground shadow-xl shadow-primary/18 sm:col-span-2 sm:row-span-2">
        <CardContent className="relative z-10 flex h-full min-h-[210px] flex-col justify-between p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary-foreground/65">Current buying requirement</p>
              <p className="mt-2 text-5xl font-black tracking-[-0.06em]">{totals.toOrder.toLocaleString()}</p>
              <p className="mt-1 text-sm font-semibold text-primary-foreground/70">units still need purchase orders</p>
            </div>
            <span className="grid h-14 w-14 place-items-center rounded-[20px] bg-white/15 ring-1 ring-white/20"><Boxes className="h-6 w-6" /></span>
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between text-xs font-semibold"><span>Demand covered</span><span>{coverage}%</span></div>
            <div className="h-2.5 overflow-hidden rounded-full bg-black/15"><div className="h-full rounded-full bg-white transition-all" style={{ width: `${coverage}%` }} /></div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <span className="rounded-xl bg-white/10 px-2 py-2"><strong className="block text-base">{totals.needed.toLocaleString()}</strong><small className="text-[8px] uppercase tracking-wider opacity-65">needed</small></span>
              <span className="rounded-xl bg-white/10 px-2 py-2"><strong className="block text-base">{totals.inStock.toLocaleString()}</strong><small className="text-[8px] uppercase tracking-wider opacity-65">in stock</small></span>
              <span className="rounded-xl bg-white/10 px-2 py-2"><strong className="block text-base">{totals.onPO.toLocaleString()}</strong><small className="text-[8px] uppercase tracking-wider opacity-65">on PO</small></span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Metric label="Urgent lines" value={totals.urgent} icon={AlertTriangle} tone={totals.urgent > 0 ? "danger" : "neutral"} />
      <Metric label="Stockout risk" value={totals.stockoutRisk} icon={ShieldAlert} tone={totals.stockoutRisk > 0 ? "danger" : "success"} />
      <Metric label="Average wait" value={`${avgDaysWaiting} days`} icon={Clock3} tone={avgDaysWaiting > 7 ? "danger" : "neutral"} />
      <Metric label="Supplier network" value={supplierCount} icon={Truck} />
      <Metric label="Class A items" value={totals.abcA} icon={PackageCheck} tone="primary" />
      {totals.estimatedCost > 0 && <Metric label="Estimated spend" value={`R${totals.estimatedCost.toLocaleString()}`} icon={CircleDollarSign} tone="primary" />}
    </div>
  );
}
