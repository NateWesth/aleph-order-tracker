import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, TrendingDown, Clock, Building2, Package, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Anomaly {
  id: string;
  severity: "high" | "medium" | "low";
  icon: any;
  title: string;
  detail: string;
  metric?: string;
}

export default function AnomalyAlertsWidget() {
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    detectAnomalies();
  }, []);

  const detectAnomalies = async () => {
    setLoading(true);
    try {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const week = new Date(now.getTime() - 7 * 86400000).toISOString();
      const twoWeek = new Date(now.getTime() - 14 * 86400000).toISOString();
      const month = new Date(now.getTime() - 30 * 86400000).toISOString();
      const twoMonth = new Date(now.getTime() - 60 * 86400000).toISOString();

      const [thisWeek, lastWeek, todayOrders, oldStuck, items, lastMonthOrders, prevMonthOrders] = await Promise.all([
        supabase.from("orders").select("id, total_amount, company_id, companies(name)").gte("created_at", week),
        supabase.from("orders").select("id, total_amount, company_id, companies(name)").gte("created_at", twoWeek).lt("created_at", week),
        supabase.from("orders").select("id").gte("created_at", today),
        supabase.from("orders").select("id, order_number, created_at, status").neq("status", "delivered").lt("created_at", new Date(now.getTime() - 21 * 86400000).toISOString()),
        supabase.from("order_items").select("id, name, stock_status, created_at").eq("stock_status", "awaiting"),
        supabase.from("orders").select("id, total_amount, company_id, companies(name)").gte("created_at", month),
        supabase.from("orders").select("id, total_amount, company_id, companies(name)").gte("created_at", twoMonth).lt("created_at", month),
      ]);

      const tw = thisWeek.data || [];
      const lw = lastWeek.data || [];
      const found: Anomaly[] = [];

      // 1. Order volume drop > 30%
      if (lw.length >= 5 && tw.length < lw.length * 0.7) {
        const dropPct = Math.round(((lw.length - tw.length) / lw.length) * 100);
        found.push({
          id: "order-drop",
          severity: "high",
          icon: TrendingDown,
          title: `Order volume dropped ${dropPct}%`,
          detail: `${tw.length} this week vs ${lw.length} last week.`,
          metric: `-${dropPct}%`,
        });
      }

      // 2. Revenue drop > 30%
      const sum = (a: any[]) => a.reduce((s, o) => s + (Number(o.total_amount) || 0), 0);
      const twRev = sum(tw);
      const lwRev = sum(lw);
      if (lwRev >= 10000 && twRev < lwRev * 0.7) {
        const dropPct = Math.round(((lwRev - twRev) / lwRev) * 100);
        found.push({
          id: "rev-drop",
          severity: "high",
          icon: TrendingDown,
          title: `Revenue dropped ${dropPct}% this week`,
          detail: `R${Math.round(twRev).toLocaleString()} vs R${Math.round(lwRev).toLocaleString()} last week.`,
          metric: `-${dropPct}%`,
        });
      }

      // 3. Zero orders today (after 11am)
      if (now.getHours() >= 11 && (todayOrders.data || []).length === 0) {
        found.push({
          id: "no-orders-today",
          severity: "medium",
          icon: AlertCircle,
          title: "No orders received today",
          detail: `It's ${now.getHours()}:00 and no new orders yet.`,
        });
      }

      // 4. Orders stuck >21 days
      const stuck = oldStuck.data || [];
      if (stuck.length > 0) {
        found.push({
          id: "stuck-orders",
          severity: stuck.length > 5 ? "high" : "medium",
          icon: Clock,
          title: `${stuck.length} order${stuck.length > 1 ? "s" : ""} stuck >21 days`,
          detail: stuck.slice(0, 3).map(o => o.order_number).join(", ") + (stuck.length > 3 ? "…" : ""),
          metric: `${stuck.length}`,
        });
      }

      // 5. Items awaiting stock for >14 days
      const oldAwaiting = (items.data || []).filter(i => {
        const days = (Date.now() - new Date(i.created_at).getTime()) / 86400000;
        return days > 14;
      });
      if (oldAwaiting.length > 3) {
        found.push({
          id: "stale-stock",
          severity: "medium",
          icon: Package,
          title: `${oldAwaiting.length} items awaiting stock >14 days`,
          detail: "Consider escalating with suppliers or sourcing alternatives.",
          metric: `${oldAwaiting.length}`,
        });
      }

      // 6. Top client churn (had orders last month, none this month)
      const lastM = lastMonthOrders.data || [];
      const prevM = prevMonthOrders.data || [];
      const lastMClients = new Set(lastM.map((o: any) => o.company_id));
      const prevMByClient: Record<string, { name: string; value: number }> = {};
      for (const o of prevM as any[]) {
        if (!o.company_id) continue;
        if (!prevMByClient[o.company_id]) {
          prevMByClient[o.company_id] = { name: o.companies?.name || "Unknown", value: 0 };
        }
        prevMByClient[o.company_id].value += Number(o.total_amount) || 0;
      }
      const churned = Object.entries(prevMByClient)
        .filter(([id, v]) => v.value >= 5000 && !lastMClients.has(id))
        .sort((a, b) => b[1].value - a[1].value)
        .slice(0, 3);

      if (churned.length > 0) {
        found.push({
          id: "client-churn",
          severity: "medium",
          icon: Building2,
          title: `${churned.length} top client${churned.length > 1 ? "s" : ""} silent this month`,
          detail: churned.map(([, v]) => v.name).join(", ") + " — no orders in 30 days.",
        });
      }

      setAnomalies(found);
    } catch (err) {
      console.error("Anomaly detection error:", err);
    } finally {
      setLoading(false);
    }
  };

  const sevColor = (s: string) => {
    switch (s) {
      case "high": return "border-destructive/30 bg-destructive/5 text-destructive";
      case "medium": return "border-amber-500/30 bg-amber-500/5 text-amber-600 dark:text-amber-400";
      default: return "border-sky-500/30 bg-sky-500/5 text-sky-600 dark:text-sky-400";
    }
  };

  return (
    <Card className="glass-card glow-border border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-amber-500" />
          Anomaly Alerts
          {anomalies.length > 0 && (
            <Badge variant="secondary" className="ml-auto text-[10px]">{anomalies.length}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : anomalies.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">All systems normal ✨</p>
        ) : (
          <div className="space-y-2">
            {anomalies.map(a => (
              <div key={a.id} className={cn("flex items-start gap-3 p-3 rounded-xl border", sevColor(a.severity))}>
                <a.icon className="h-4 w-4 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{a.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{a.detail}</p>
                </div>
                {a.metric && (
                  <Badge variant="outline" className={cn("text-[10px] shrink-0", sevColor(a.severity))}>
                    {a.metric}
                  </Badge>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
