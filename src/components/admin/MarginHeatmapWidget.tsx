import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Flame, Loader2 } from "lucide-react";
import { format, subMonths, startOfMonth } from "date-fns";
import { cn } from "@/lib/utils";

interface MarginCell {
  key: string;
  label: string;
  revenue: number;
  cost: number;
  margin: number; // %
  count: number;
}

const monthsBack = 3;

const marginColor = (m: number) => {
  if (m >= 30) return "bg-emerald-500/80 text-emerald-50";
  if (m >= 25) return "bg-emerald-400/60 text-emerald-50";
  if (m >= 15) return "bg-amber-400/70 text-amber-950";
  if (m >= 5) return "bg-orange-500/70 text-orange-50";
  return "bg-destructive/70 text-destructive-foreground";
};

const marginLabel = (m: number) => {
  if (m >= 30) return "Excellent";
  if (m >= 25) return "Healthy";
  if (m >= 15) return "OK";
  if (m >= 5) return "Thin";
  return "Loss-zone";
};

export default function MarginHeatmapWidget() {
  const [loading, setLoading] = useState(true);
  const [byClient, setByClient] = useState<MarginCell[]>([]);
  const [byItem, setByItem] = useState<MarginCell[]>([]);

  useEffect(() => {
    void load();
  }, []);

  const load = async () => {
    try {
      const months: string[] = [];
      for (let i = 0; i < monthsBack; i++) {
        months.push(format(startOfMonth(subMonths(new Date(), i)), "yyyy-MM-dd"));
      }
      const { data, error } = await supabase
        .from("commission_report_cache")
        .select("period_month, report")
        .is("rep_id", null)
        .in("period_month", months);

      if (error) throw error;

      const clientMap = new Map<string, MarginCell>();
      const itemMap = new Map<string, MarginCell>();

      for (const row of data || []) {
        const repList = (row.report as any)?.data || [];
        for (const rep of repList) {
          for (const inv of rep.invoices || []) {
            const customer = inv.customer_name || "Unknown";
            for (const li of inv.line_items || []) {
              const sub = Number(li.sub_total || 0);
              const cost = Number(li.cost || 0) * Number(li.quantity || 0);
              if (sub <= 0) continue;

              // By client
              const c = clientMap.get(customer) || { key: customer, label: customer, revenue: 0, cost: 0, margin: 0, count: 0 };
              c.revenue += sub;
              c.cost += cost;
              c.count += 1;
              clientMap.set(customer, c);

              // By item
              const itemKey = (li.code || li.name || "Unknown").toString();
              const itemLabel = li.name || li.code || "Unknown";
              const it = itemMap.get(itemKey) || { key: itemKey, label: itemLabel, revenue: 0, cost: 0, margin: 0, count: 0 };
              it.revenue += sub;
              it.cost += cost;
              it.count += 1;
              itemMap.set(itemKey, it);
            }
          }
        }
      }

      const finalize = (map: Map<string, MarginCell>) =>
        Array.from(map.values())
          .map(c => ({ ...c, margin: c.revenue > 0 ? ((c.revenue - c.cost) / c.revenue) * 100 : 0 }))
          .filter(c => c.revenue >= 1000) // hide noise
          .sort((a, b) => b.revenue - a.revenue)
          .slice(0, 24);

      setByClient(finalize(clientMap));
      setByItem(finalize(itemMap));
    } catch (e) {
      console.error("Margin heatmap load error", e);
    } finally {
      setLoading(false);
    }
  };

  const renderGrid = (cells: MarginCell[]) => {
    const maxRev = Math.max(...cells.map(c => c.revenue), 1);
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5">
        {cells.map(c => {
          // size by revenue (relative)
          const intensity = Math.max(0.4, c.revenue / maxRev);
          return (
            <div
              key={c.key}
              className={cn(
                "rounded-lg p-2 transition-transform hover:scale-105 cursor-default",
                marginColor(c.margin)
              )}
              style={{ opacity: 0.55 + intensity * 0.45 }}
              title={`${c.label}\nRevenue: R${c.revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}\nCost: R${c.cost.toLocaleString(undefined, { maximumFractionDigits: 0 })}\nMargin: ${c.margin.toFixed(1)}% (${marginLabel(c.margin)})\n${c.count} lines`}
            >
              <p className="text-[11px] font-semibold truncate leading-tight">{c.label}</p>
              <p className="text-[10px] opacity-90 mt-0.5 tabular-nums">
                {c.margin.toFixed(0)}% · R{(c.revenue / 1000).toFixed(0)}k
              </p>
            </div>
          );
        })}
      </div>
    );
  };

  const legend = useMemo(() => (
    <div className="flex flex-wrap items-center gap-2 mt-3 text-[10px] text-muted-foreground">
      {[
        { label: "≥30%", c: "bg-emerald-500/80" },
        { label: "25-30%", c: "bg-emerald-400/60" },
        { label: "15-25%", c: "bg-amber-400/70" },
        { label: "5-15%", c: "bg-orange-500/70" },
        { label: "<5%", c: "bg-destructive/70" },
      ].map(l => (
        <span key={l.label} className="flex items-center gap-1">
          <span className={cn("h-2.5 w-2.5 rounded-sm", l.c)} />
          {l.label}
        </span>
      ))}
      <span className="ml-auto">Last {monthsBack} months · opacity = revenue weight</span>
    </div>
  ), []);

  return (
    <Card className="glass-card glow-border border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Flame className="h-4 w-4 text-orange-500" />
          Margin Heatmap
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : byClient.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No margin data yet. Refresh commission months to populate.
          </p>
        ) : (
          <Tabs defaultValue="clients">
            <TabsList className="h-8 mb-3">
              <TabsTrigger value="clients" className="text-xs h-6">Clients</TabsTrigger>
              <TabsTrigger value="items" className="text-xs h-6">Items</TabsTrigger>
            </TabsList>
            <TabsContent value="clients" className="mt-0">{renderGrid(byClient)}</TabsContent>
            <TabsContent value="items" className="mt-0">{renderGrid(byItem)}</TabsContent>
          </Tabs>
        )}
        {!loading && byClient.length > 0 && legend}
      </CardContent>
    </Card>
  );
}
