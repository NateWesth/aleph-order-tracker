import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { format, subDays, startOfDay, eachDayOfInterval } from "date-fns";

const CHART_COLORS = [
  "hsl(270, 76%, 52%)",
  "hsl(200, 80%, 50%)",
  "hsl(150, 60%, 45%)",
  "hsl(40, 90%, 55%)",
  "hsl(0, 72%, 55%)",
  "hsl(280, 60%, 60%)",
];

interface OrderVolumeData {
  date: string;
  created: number;
  completed: number;
}

interface ClientBreakdown {
  name: string;
  count: number;
}

interface SupplierPerformance {
  name: string;
  poCount: number;
}

export default function AnalyticsWidgets() {
  const [orderVolume, setOrderVolume] = useState<OrderVolumeData[]>([]);
  const [clientBreakdown, setClientBreakdown] = useState<ClientBreakdown[]>([]);
  const [supplierPerf, setSupplierPerf] = useState<SupplierPerformance[]>([]);
  const [trendPercent, setTrendPercent] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      const now = new Date();
      const thirtyDaysAgo = subDays(now, 30);
      const sixtyDaysAgo = subDays(now, 60);

      const [allOrders, completedOrders, companies, pos] = await Promise.all([
        supabase.from("orders").select("id, created_at, company_id, status").gte("created_at", thirtyDaysAgo.toISOString()),
        supabase.from("orders").select("id, completed_date").eq("status", "delivered").gte("completed_date", thirtyDaysAgo.toISOString()),
        supabase.from("orders").select("company_id, companies(name)").not("company_id", "is", null),
        supabase.from("order_purchase_orders").select("supplier_id, suppliers(name)").gte("created_at", thirtyDaysAgo.toISOString()),
      ]);

      // Order volume by day
      const days = eachDayOfInterval({ start: thirtyDaysAgo, end: now });
      const volumeData = days.map(day => {
        const dayStr = format(day, "yyyy-MM-dd");
        const created = (allOrders.data || []).filter(o => format(new Date(o.created_at!), "yyyy-MM-dd") === dayStr).length;
        const completed = (completedOrders.data || []).filter(o => o.completed_date && format(new Date(o.completed_date), "yyyy-MM-dd") === dayStr).length;
        return { date: format(day, "MMM dd"), created, completed };
      });
      // Show last 14 days for cleaner chart
      setOrderVolume(volumeData.slice(-14));

      // Trend: compare last 15 days vs previous 15 days
      const mid = Math.floor(volumeData.length / 2);
      const firstHalf = volumeData.slice(0, mid).reduce((s, d) => s + d.created, 0);
      const secondHalf = volumeData.slice(mid).reduce((s, d) => s + d.created, 0);
      setTrendPercent(firstHalf > 0 ? Math.round(((secondHalf - firstHalf) / firstHalf) * 100) : 0);

      // Client breakdown
      const clientMap = new Map<string, number>();
      (companies.data || []).forEach((o: any) => {
        const name = o.companies?.name || "Unknown";
        clientMap.set(name, (clientMap.get(name) || 0) + 1);
      });
      setClientBreakdown(
        Array.from(clientMap.entries())
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 6)
      );

      // Supplier PO counts
      const supplierMap = new Map<string, number>();
      (pos.data || []).forEach((po: any) => {
        const name = po.suppliers?.name || "Unknown";
        supplierMap.set(name, (supplierMap.get(name) || 0) + 1);
      });
      setSupplierPerf(
        Array.from(supplierMap.entries())
          .map(([name, poCount]) => ({ name, poCount }))
          .sort((a, b) => b.poCount - a.poCount)
          .slice(0, 5)
      );
    } catch (err) {
      console.error("Analytics fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2, 3].map(i => (
          <Card key={i} className="glass-card glow-border border-border/50">
            <CardContent className="p-6"><div className="shimmer h-48 rounded-lg" /></CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const TrendIcon = trendPercent > 0 ? TrendingUp : trendPercent < 0 ? TrendingDown : Minus;
  const trendColor = trendPercent > 0 ? "text-emerald-500" : trendPercent < 0 ? "text-destructive" : "text-muted-foreground";

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Order Volume Trend */}
      <Card className="glass-card glow-border border-border/50 md:col-span-2">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">Order Volume (14 days)</CardTitle>
            <Badge variant="outline" className={`gap-1 ${trendColor}`}>
              <TrendIcon className="h-3 w-3" />
              {Math.abs(trendPercent)}% vs prior
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={orderVolume}>
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "0.5rem",
                  fontSize: "12px",
                }}
              />
              <Line type="monotone" dataKey="created" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Created" />
              <Line type="monotone" dataKey="completed" stroke="hsl(150, 60%, 45%)" strokeWidth={2} dot={false} name="Completed" />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Top Clients Pie */}
      <Card className="glass-card glow-border border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Top Clients</CardTitle>
        </CardHeader>
        <CardContent>
          {clientBreakdown.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No client data yet</p>
          ) : (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="50%" height={160}>
                <PieChart>
                  <Pie data={clientBreakdown} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={65} innerRadius={35}>
                    {clientBreakdown.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "0.5rem",
                      fontSize: "12px",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-1.5">
                {clientBreakdown.map((c, i) => (
                  <div key={c.name} className="flex items-center gap-2 text-xs">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                    <span className="truncate text-foreground">{c.name}</span>
                    <span className="text-muted-foreground ml-auto">{c.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Supplier PO Activity */}
      <Card className="glass-card glow-border border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Supplier PO Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {supplierPerf.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No PO data yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={supplierPerf} layout="vertical">
                <XAxis type="number" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} width={80} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "0.5rem",
                    fontSize: "12px",
                  }}
                />
                <Bar dataKey="poCount" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} name="POs" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
