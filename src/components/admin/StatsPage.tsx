import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { 
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, Tooltip
} from "recharts";
import { 
  Package, TrendingUp, Clock, Users,
  Calendar, ShoppingBag, Award, Hash, BarChart3
} from "lucide-react";
import { format, subDays, startOfYear, isWithinInterval, eachMonthOfInterval, startOfMonth, endOfMonth, differenceInDays } from "date-fns";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

import ReportGenerator from "./ReportGenerator";
import SupplierScorecard from "./SupplierScorecard";
import OrderActivityHeatmap from "./OrderActivityHeatmap";

type PresetKey = "7d" | "30d" | "90d" | "year" | "all";

interface DateRange {
  from: Date;
  to: Date;
}

interface TopItem {
  name: string;
  code: string | null;
  orderCount: number;    // how many orders it appears in
  avgQuantity: number;   // average quantity per order
  totalQuantity: number; // total across all orders
}

interface TopClient {
  name: string;
  orders: number;
  totalValue: number;
}

interface Stats {
  totalOrders: number;
  totalClients: number;
  ordersInRange: number;
  avgCompletionDays: number;
  ordersByStatus: { name: string; value: number; color: string }[];
  ordersByPeriod: { period: string; orders: number }[];
  topItems: TopItem[];
  topClients: TopClient[];
  activeOrders: number;
  completedInRange: number;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "#f59e0b",
  ordered: "#3b82f6",
  "in-stock": "#10b981",
  processing: "#8b5cf6",
  completed: "#06b6d4",
  delivered: "#22c55e",
};

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: "7d", label: "7D" },
  { key: "30d", label: "30D" },
  { key: "90d", label: "90D" },
  { key: "year", label: "YTD" },
  { key: "all", label: "All" },
];

function getPresetRange(preset: PresetKey): DateRange {
  const now = new Date();
  switch (preset) {
    case "7d": return { from: subDays(now, 7), to: now };
    case "30d": return { from: subDays(now, 30), to: now };
    case "90d": return { from: subDays(now, 90), to: now };
    case "year": return { from: startOfYear(now), to: now };
    case "all":
    default: return { from: new Date(2020, 0, 1), to: now };
  }
}

export default function StatsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [activePreset, setActivePreset] = useState<PresetKey>("30d");
  const [dateRange, setDateRange] = useState<DateRange>(getPresetRange("30d"));
  const [customRange, setCustomRange] = useState<{ from?: Date; to?: Date }>({});
  const [isCustom, setIsCustom] = useState(false);

  useEffect(() => {
    fetchStats();
  }, [dateRange]);

  const handlePresetClick = (preset: PresetKey) => {
    setActivePreset(preset);
    setIsCustom(false);
    setDateRange(getPresetRange(preset));
  };

  const handleCustomDateSelect = (range: { from?: Date; to?: Date } | undefined) => {
    if (!range) return;
    setCustomRange(range);
    if (range.from && range.to) {
      setIsCustom(true);
      setActivePreset("all");
      setDateRange({ from: range.from, to: range.to });
    }
  };

  const fetchStats = async () => {
    try {
      setLoading(true);

      const [ordersRes, itemsRes, companiesRes] = await Promise.all([
        supabase.from("orders").select("*, companies(name)"),
        supabase.from("order_items").select("name, code, quantity, order_id"),
        supabase.from("companies").select("id"),
      ]);

      if (ordersRes.error) throw ordersRes.error;
      if (itemsRes.error) throw itemsRes.error;

      const orders = ordersRes.data || [];
      const orderItems = itemsRes.data || [];
      const totalOrders = orders.length;
      const totalClients = companiesRes.data?.length || 0;

      // Filter to range
      const ordersInRange = orders.filter(o => {
        const date = new Date(o.created_at!);
        return isWithinInterval(date, { start: dateRange.from, end: dateRange.to });
      });

      const activeOrders = ordersInRange.filter(o => 
        o.status && !["completed", "delivered"].includes(o.status)
      ).length;

      const completedInRange = ordersInRange.filter(o => 
        o.status === "completed" || o.status === "delivered"
      ).length;

      // Avg completion
      const completedWithDates = ordersInRange.filter(o => 
        (o.status === "completed" || o.status === "delivered") && o.completed_date
      );
      const avgCompletionDays = completedWithDates.length > 0
        ? Math.round(completedWithDates.reduce((acc, o) => 
            acc + differenceInDays(new Date(o.completed_date!), new Date(o.created_at!)), 0
          ) / completedWithDates.length * 10) / 10
        : 0;

      // Status distribution
      const statusCounts: Record<string, number> = {};
      ordersInRange.forEach(o => {
        const status = o.status || "pending";
        statusCounts[status] = (statusCounts[status] || 0) + 1;
      });
      const ordersByStatus = Object.entries(statusCounts).map(([name, value]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1).replace("-", " "),
        value,
        color: STATUS_COLORS[name] || "#94a3b8",
      }));

      // Orders by period
      const months = eachMonthOfInterval({ start: dateRange.from, end: dateRange.to });
      const ordersByPeriod = months.slice(-12).map(monthDate => {
        const monthStart = startOfMonth(monthDate);
        const monthEnd = endOfMonth(monthDate);
        return {
          period: format(monthDate, "MMM"),
          orders: ordersInRange.filter(o => 
            isWithinInterval(new Date(o.created_at!), { start: monthStart, end: monthEnd })
          ).length,
        };
      });

      // TOP ITEMS — ranked by how many ORDERS they appear in (frequency), not raw quantity
      const orderIdsInRange = new Set(ordersInRange.map(o => o.id));
      const itemsInRange = orderItems.filter(item => orderIdsInRange.has(item.order_id));
      
      const itemStats: Record<string, { 
        name: string; code: string | null; orderIds: Set<string>; totalQty: number 
      }> = {};
      
      itemsInRange.forEach(item => {
        // Use code as key if available, otherwise name
        const key = item.code ? item.code.toLowerCase() : item.name.toLowerCase();
        if (!itemStats[key]) {
          itemStats[key] = { name: item.name, code: item.code, orderIds: new Set(), totalQty: 0 };
        }
        itemStats[key].orderIds.add(item.order_id);
        itemStats[key].totalQty += item.quantity;
      });

      const topItems: TopItem[] = Object.values(itemStats)
        .map(s => ({
          name: s.name,
          code: s.code,
          orderCount: s.orderIds.size,
          avgQuantity: Math.round((s.totalQty / s.orderIds.size) * 10) / 10,
          totalQuantity: s.totalQty,
        }))
        .sort((a, b) => b.orderCount - a.orderCount)
        .slice(0, 8);

      // Top clients
      const clientData: Record<string, { orders: number; totalValue: number }> = {};
      ordersInRange.forEach(o => {
        const name = (o.companies as any)?.name || "Unknown";
        if (!clientData[name]) clientData[name] = { orders: 0, totalValue: 0 };
        clientData[name].orders++;
        clientData[name].totalValue += o.total_amount || 0;
      });
      const topClients: TopClient[] = Object.entries(clientData)
        .sort(([, a], [, b]) => b.orders - a.orders)
        .slice(0, 6)
        .map(([name, data]) => ({ name, ...data }));

      setStats({
        totalOrders,
        totalClients,
        ordersInRange: ordersInRange.length,
        avgCompletionDays,
        ordersByStatus,
        ordersByPeriod,
        topItems,
        topClients,
        activeOrders,
        completedInRange,
      });
    } catch (error) {
      console.error("Error fetching stats:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <PageSkeleton variant="stats" />;
  if (!stats) return (
    <div className="flex items-center justify-center h-64">
      <p className="text-muted-foreground">Unable to load statistics</p>
    </div>
  );

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {format(dateRange.from, "MMM d, yyyy")} — {format(dateRange.to, "MMM d, yyyy")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ReportGenerator />
        </div>
      </div>

      {/* Date Range Selector */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="inline-flex items-center rounded-lg border border-border bg-card p-0.5 gap-0.5">
          {PRESETS.map(preset => (
            <button
              key={preset.key}
              onClick={() => handlePresetClick(preset.key)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                activePreset === preset.key && !isCustom
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant={isCustom ? "default" : "outline"}
              size="sm"
              className="text-xs gap-1.5 h-8"
            >
              <Calendar className="h-3.5 w-3.5" />
              {isCustom && customRange.from && customRange.to
                ? `${format(customRange.from, "MMM d")} – ${format(customRange.to, "MMM d")}`
                : "Custom"
              }
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <CalendarComponent
              mode="range"
              selected={customRange as any}
              onSelect={handleCustomDateSelect as any}
              numberOfMonths={2}
              className="pointer-events-auto"
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KPICard icon={<Package className="h-4 w-4" />} label="Total Orders" value={stats.totalOrders} />
        <KPICard icon={<ShoppingBag className="h-4 w-4" />} label="In Period" value={stats.ordersInRange} accent />
        <KPICard icon={<TrendingUp className="h-4 w-4" />} label="Active" value={stats.activeOrders} />
        <KPICard icon={<Clock className="h-4 w-4" />} label="Avg. Completion" value={`${stats.avgCompletionDays}d`} />
        <KPICard icon={<Users className="h-4 w-4" />} label="Clients" value={stats.totalClients} className="col-span-2 lg:col-span-1" />
      </div>

      {/* Main Charts Row */}
      <div className="grid lg:grid-cols-3 gap-4">
        {/* Orders Trend */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            Orders Over Time
          </h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.ordersByPeriod}>
                <defs>
                  <linearGradient id="orderGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis 
                  dataKey="period" 
                  axisLine={false} tickLine={false}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                />
                <YAxis 
                  axisLine={false} tickLine={false} width={28}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                />
                <Tooltip
                  contentStyle={{ 
                    background: 'hsl(var(--card))', 
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '12px'
                  }}
                />
                <Area 
                  type="monotone" dataKey="orders" name="Orders"
                  stroke="hsl(var(--primary))" strokeWidth={2}
                  fill="url(#orderGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Status Breakdown */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold mb-4">Status Breakdown</h3>
          {stats.ordersByStatus.length > 0 ? (
            <div className="space-y-4">
              <div className="h-32 mx-auto w-32">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stats.ordersByStatus}
                      cx="50%" cy="50%"
                      innerRadius={30} outerRadius={52}
                      paddingAngle={3} dataKey="value"
                    >
                      {stats.ordersByStatus.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2">
                {stats.ordersByStatus.map((status, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: status.color }} />
                      <span className="text-xs text-muted-foreground">{status.name}</span>
                    </div>
                    <span className="text-xs font-semibold tabular-nums">{status.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">No orders in period</p>
          )}
        </div>
      </div>

      {/* Most Popular Items & Top Clients */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Most Popular Items */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Award className="h-4 w-4 text-primary" />
              Most Popular Items
            </h3>
            <Badge variant="secondary" className="text-[10px] font-normal">
              By order frequency
            </Badge>
          </div>
          <p className="text-[11px] text-muted-foreground mb-4">
            Ranked by how many orders each item appears in, not raw quantity
          </p>
          {stats.topItems.length > 0 ? (
            <div className="space-y-3">
              {stats.topItems.map((item, i) => {
                const maxOrders = stats.topItems[0]?.orderCount || 1;
                const pct = (item.orderCount / maxOrders) * 100;
                return (
                  <div key={i} className="group">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0",
                        i === 0 ? "bg-primary text-primary-foreground" :
                        i === 1 ? "bg-primary/20 text-primary" :
                        i === 2 ? "bg-primary/10 text-primary" :
                        "bg-muted text-muted-foreground"
                      )}>
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-medium truncate">{item.name}</p>
                          {item.code && (
                            <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                              {item.code}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1">
                          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div 
                              className="h-full rounded-full bg-primary/60 transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                              <Hash className="h-2.5 w-2.5" />
                              {item.orderCount} orders
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              ~{item.avgQuantity}/order
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">No items in period</p>
          )}
        </div>

        {/* Top Clients */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            Top Clients
          </h3>
          {stats.topClients.length > 0 ? (
            <div className="space-y-3">
              {stats.topClients.map((client, i) => {
                const maxOrders = stats.topClients[0]?.orders || 1;
                return (
                  <div key={i} className="flex items-center gap-3">
                    <div className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0",
                      i === 0 ? "bg-primary text-primary-foreground" :
                      i === 1 ? "bg-primary/20 text-primary" :
                      "bg-muted text-muted-foreground"
                    )}>
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{client.name}</p>
                      <div className="flex items-center gap-3 mt-1">
                        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div 
                            className="h-full rounded-full bg-primary/50 transition-all"
                            style={{ width: `${(client.orders / maxOrders) * 100}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {client.orders} orders
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">No clients in period</p>
          )}
        </div>
      </div>

      {/* Activity Heatmap */}
      <OrderActivityHeatmap />

      {/* Supplier Scorecard */}
      <SupplierScorecard />
    </div>
  );
}

// ─── KPI Card ──────────────────────────────────────────────────────────────────

function KPICard({ 
  icon, label, value, accent, className 
}: { 
  icon: React.ReactNode; label: string; value: string | number; accent?: boolean; className?: string 
}) {
  return (
    <div className={cn(
      "rounded-xl border p-4 transition-all",
      accent 
        ? "bg-primary/5 border-primary/20" 
        : "bg-card border-border",
      className
    )}>
      <div className={cn(
        "inline-flex items-center justify-center w-7 h-7 rounded-lg mb-3",
        accent ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
      )}>
        {icon}
      </div>
      <p className="text-xl font-bold tracking-tight">{value}</p>
      <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}
