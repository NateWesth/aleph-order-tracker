import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { 
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, Legend
} from "recharts";
import { 
  Package, TrendingUp, Clock, Users,
  ArrowUpRight, ArrowDownRight, Calendar, GitCompare
} from "lucide-react";
import { format, subMonths, startOfMonth, endOfMonth, differenceInDays, startOfYear, subDays, isWithinInterval, eachMonthOfInterval } from "date-fns";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { PageSkeleton } from "@/components/ui/PageSkeleton";

import ReportGenerator from "./ReportGenerator";
import SupplierScorecard from "./SupplierScorecard";
import OrderActivityHeatmap from "./OrderActivityHeatmap";

type PresetKey = "7d" | "30d" | "90d" | "year" | "all";

interface DateRange {
  from: Date;
  to: Date;
}

interface PeriodStats {
  ordersInRange: number;
  avgCompletionDays: number;
  ordersByStatus: { name: string; value: number; color: string }[];
  ordersByPeriod: { period: string; orders: number }[];
  topItems: { name: string; quantity: number }[];
  topClients: { name: string; orders: number }[];
}

interface OrderStats extends PeriodStats {
  totalOrders: number;
  totalClients: number;
  comparisonStats?: PeriodStats;
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
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "90d", label: "90 days" },
  { key: "year", label: "This year" },
  { key: "all", label: "All time" },
];

function getPresetRange(preset: PresetKey): DateRange {
  const now = new Date();
  
  switch (preset) {
    case "7d":
      return { from: subDays(now, 7), to: now };
    case "30d":
      return { from: subDays(now, 30), to: now };
    case "90d":
      return { from: subDays(now, 90), to: now };
    case "year":
      return { from: startOfYear(now), to: now };
    case "all":
    default:
      return { from: new Date(2020, 0, 1), to: now };
  }
}

export default function StatsPage() {
  const [stats, setStats] = useState<OrderStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [activePreset, setActivePreset] = useState<PresetKey>("30d");
  const [dateRange, setDateRange] = useState<DateRange>(getPresetRange("30d"));
  const [customRange, setCustomRange] = useState<{ from?: Date; to?: Date }>({});
  const [isCustom, setIsCustom] = useState(false);
  
  // Comparison mode
  const [comparisonMode, setComparisonMode] = useState(false);
  const [comparisonPreset, setComparisonPreset] = useState<PresetKey>("30d");
  const [comparisonRange, setComparisonRange] = useState<DateRange>(getPresetRange("30d"));
  const [comparisonCustomRange, setComparisonCustomRange] = useState<{ from?: Date; to?: Date }>({});
  const [isComparisonCustom, setIsComparisonCustom] = useState(false);

  useEffect(() => {
    fetchStats();
  }, [dateRange, comparisonMode, comparisonRange]);

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

  const handleComparisonPresetClick = (preset: PresetKey) => {
    setComparisonPreset(preset);
    setIsComparisonCustom(false);
    setComparisonRange(getPresetRange(preset));
  };

  const handleComparisonCustomDateSelect = (range: { from?: Date; to?: Date } | undefined) => {
    if (!range) return;
    setComparisonCustomRange(range);
    if (range.from && range.to) {
      setIsComparisonCustom(true);
      setComparisonPreset("all");
      setComparisonRange({ from: range.from, to: range.to });
    }
  };

  const calculatePeriodStats = (
    orders: any[], 
    orderItems: any[], 
    range: DateRange
  ): PeriodStats => {
    const ordersInRange = orders.filter(o => {
      const date = new Date(o.created_at!);
      return isWithinInterval(date, { start: range.from, end: range.to });
    });

    const completedOrdersInRange = ordersInRange.filter(o => 
      (o.status === "completed" || o.status === "delivered") && o.completed_date
    );
    const avgCompletionDays = completedOrdersInRange.length > 0
      ? completedOrdersInRange.reduce((acc, o) => {
          const days = differenceInDays(new Date(o.completed_date!), new Date(o.created_at!));
          return acc + days;
        }, 0) / completedOrdersInRange.length
      : 0;

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

    const months = eachMonthOfInterval({ start: range.from, end: range.to });
    const ordersByPeriod = months.slice(-6).map(monthDate => {
      const monthStart = startOfMonth(monthDate);
      const monthEnd = endOfMonth(monthDate);
      const count = ordersInRange.filter(o => {
        const date = new Date(o.created_at!);
        return isWithinInterval(date, { start: monthStart, end: monthEnd });
      }).length;
      return {
        period: format(monthDate, "MMM"),
        orders: count,
      };
    });

    const orderIdsInRange = new Set(ordersInRange.map(o => o.id));
    const itemsInRange = orderItems.filter(item => orderIdsInRange.has(item.order_id));
    
    const itemCounts: Record<string, number> = {};
    itemsInRange.forEach(item => {
      const name = item.name;
      itemCounts[name] = (itemCounts[name] || 0) + item.quantity;
    });
    const topItems = Object.entries(itemCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([name, quantity]) => ({ name: name.length > 15 ? name.slice(0, 15) + "…" : name, quantity }));

    const clientCounts: Record<string, number> = {};
    ordersInRange.forEach(o => {
      const companyName = (o.companies as any)?.name || "Unknown";
      clientCounts[companyName] = (clientCounts[companyName] || 0) + 1;
    });
    const topClients = Object.entries(clientCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([name, orderCount]) => ({ name: name.length > 12 ? name.slice(0, 12) + "…" : name, orders: orderCount }));

    return {
      ordersInRange: ordersInRange.length,
      avgCompletionDays: Math.round(avgCompletionDays * 10) / 10,
      ordersByStatus,
      ordersByPeriod,
      topItems,
      topClients,
    };
  };

  const fetchStats = async () => {
    try {
      setLoading(true);
      
      const { data: orders, error: ordersError } = await supabase
        .from("orders")
        .select("*, companies(name)");

      if (ordersError) throw ordersError;

      const { data: orderItems, error: itemsError } = await supabase
        .from("order_items")
        .select("name, quantity, order_id");

      if (itemsError) throw itemsError;

      const { data: companies } = await supabase
        .from("companies")
        .select("id");

      const totalOrders = orders?.length || 0;
      const totalClients = companies?.length || 0;

      const periodStats = calculatePeriodStats(orders || [], orderItems || [], dateRange);
      
      let comparisonStats: PeriodStats | undefined;
      if (comparisonMode) {
        comparisonStats = calculatePeriodStats(orders || [], orderItems || [], comparisonRange);
      }

      setStats({
        totalOrders,
        totalClients,
        ...periodStats,
        comparisonStats,
      });
    } catch (error) {
      console.error("Error fetching stats:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <PageSkeleton variant="stats" />;
  }

  if (!stats) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Unable to load statistics</p>
      </div>
    );
  }

  const comparisonChange = stats.comparisonStats && stats.comparisonStats.ordersInRange > 0
    ? Math.round(((stats.ordersInRange - stats.comparisonStats.ordersInRange) / stats.comparisonStats.ordersInRange) * 100)
    : 0;

  return (
    <div className="space-y-6 pb-8">
      {/* Controls */}
      <div className="space-y-4">
        {/* Top controls row */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <ReportGenerator />
        </div>

        {/* Comparison Toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GitCompare className="h-4 w-4 text-muted-foreground" />
            <Label htmlFor="comparison-mode" className="text-sm font-medium">Compare Periods</Label>
          </div>
          <Switch
            id="comparison-mode"
            checked={comparisonMode}
            onCheckedChange={setComparisonMode}
          />
        </div>

        {/* Primary Date Range */}
        <div className="space-y-2">
          {comparisonMode && <p className="text-xs text-muted-foreground font-medium">Period A</p>}
          <div className="flex flex-wrap items-center gap-2">
            {PRESETS.map(preset => (
              <Button
                key={preset.key}
                variant={activePreset === preset.key && !isCustom ? "default" : "outline"}
                size="sm"
                onClick={() => handlePresetClick(preset.key)}
                className="text-xs"
              >
                {preset.label}
              </Button>
            ))}
            
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={isCustom ? "default" : "outline"}
                  size="sm"
                  className={cn("text-xs gap-1.5")}
                >
                  <Calendar className="h-3.5 w-3.5" />
                  {isCustom && customRange.from && customRange.to
                    ? `${format(customRange.from, "MMM d")} - ${format(customRange.to, "MMM d")}`
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
                  defaultMonth={subMonths(new Date(), 1)}
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Comparison Date Range */}
        {comparisonMode && (
          <div className="space-y-2 pt-2 border-t border-border/50">
            <p className="text-xs text-muted-foreground font-medium">Period B (Compare with)</p>
            <div className="flex flex-wrap items-center gap-2">
              {PRESETS.map(preset => (
                <Button
                  key={`comp-${preset.key}`}
                  variant={comparisonPreset === preset.key && !isComparisonCustom ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => handleComparisonPresetClick(preset.key)}
                  className="text-xs"
                >
                  {preset.label}
                </Button>
              ))}
              
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant={isComparisonCustom ? "secondary" : "outline"}
                    size="sm"
                    className={cn("text-xs gap-1.5")}
                  >
                    <Calendar className="h-3.5 w-3.5" />
                    {isComparisonCustom && comparisonCustomRange.from && comparisonCustomRange.to
                      ? `${format(comparisonCustomRange.from, "MMM d")} - ${format(comparisonCustomRange.to, "MMM d")}`
                      : "Custom"
                    }
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="range"
                    selected={comparisonCustomRange as any}
                    onSelect={handleComparisonCustomDateSelect as any}
                    numberOfMonths={2}
                    defaultMonth={subMonths(new Date(), 1)}
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        )}
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Total Orders"
          value={stats.totalOrders}
          icon={<Package className="h-5 w-5" />}
        />
        <MetricCard
          label={comparisonMode ? "Period A" : "In Period"}
          value={stats.ordersInRange}
          comparisonValue={stats.comparisonStats?.ordersInRange}
          icon={<TrendingUp className="h-5 w-5" />}
          showComparison={comparisonMode}
        />
        <MetricCard
          label="Avg. Completion"
          value={`${stats.avgCompletionDays}d`}
          comparisonValue={stats.comparisonStats ? `${stats.comparisonStats.avgCompletionDays}d` : undefined}
          icon={<Clock className="h-5 w-5" />}
          showComparison={comparisonMode}
        />
        <MetricCard
          label="Total Clients"
          value={stats.totalClients}
          icon={<Users className="h-5 w-5" />}
        />
      </div>

      {/* Charts Grid */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Orders Trend - Comparison */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="text-sm font-medium text-muted-foreground mb-6">Orders Trend</h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={comparisonMode ? mergeChartData(stats.ordersByPeriod, stats.comparisonStats?.ordersByPeriod || []) : stats.ordersByPeriod}>
                <defs>
                  <linearGradient id="orderGradientA" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="orderGradientB" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis 
                  dataKey="period" 
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                />
                <YAxis 
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                  width={30}
                />
                {comparisonMode && <Legend />}
                <Area 
                  type="monotone" 
                  dataKey={comparisonMode ? "ordersA" : "orders"}
                  name={comparisonMode ? "Period A" : "Orders"}
                  stroke="hsl(var(--primary))" 
                  strokeWidth={2}
                  fill="url(#orderGradientA)"
                />
                {comparisonMode && (
                  <Area 
                    type="monotone" 
                    dataKey="ordersB"
                    name="Period B"
                    stroke="#f59e0b" 
                    strokeWidth={2}
                    fill="url(#orderGradientB)"
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Status Distribution - Side by Side in Comparison Mode */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="text-sm font-medium text-muted-foreground mb-6">Status Distribution</h3>
          {comparisonMode ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-center text-muted-foreground mb-2">Period A</p>
                <StatusPieChart data={stats.ordersByStatus} />
              </div>
              <div>
                <p className="text-xs text-center text-muted-foreground mb-2">Period B</p>
                <StatusPieChart data={stats.comparisonStats?.ordersByStatus || []} />
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-6">
              <div className="h-40 w-40 flex-shrink-0">
                <StatusPieChart data={stats.ordersByStatus} />
              </div>
              <div className="flex-1 space-y-2">
                {stats.ordersByStatus.length > 0 ? stats.ordersByStatus.map((status, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-2 h-2 rounded-full" 
                        style={{ backgroundColor: status.color }}
                      />
                      <span className="text-muted-foreground">{status.name}</span>
                    </div>
                    <span className="font-medium tabular-nums">{status.value}</span>
                  </div>
                )) : (
                  <p className="text-sm text-muted-foreground">No orders in this period</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Top Items - Comparison */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="text-sm font-medium text-muted-foreground mb-6">Top Items</h3>
          {comparisonMode ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-center text-muted-foreground mb-2">Period A</p>
                <TopItemsList items={stats.topItems} color="hsl(var(--primary))" />
              </div>
              <div>
                <p className="text-xs text-center text-muted-foreground mb-2">Period B</p>
                <TopItemsList items={stats.comparisonStats?.topItems || []} color="#f59e0b" />
              </div>
            </div>
          ) : stats.topItems.length > 0 ? (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.topItems} layout="vertical" barSize={16}>
                  <XAxis 
                    type="number" 
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                  />
                  <YAxis 
                    dataKey="name" 
                    type="category" 
                    axisLine={false}
                    tickLine={false}
                    width={100}
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                  />
                  <Bar 
                    dataKey="quantity" 
                    fill="hsl(var(--primary))" 
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
              No items in this period
            </div>
          )}
        </div>

        {/* Top Clients - Comparison */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="text-sm font-medium text-muted-foreground mb-6">Top Clients</h3>
          {comparisonMode ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-center text-muted-foreground mb-2">Period A</p>
                <TopClientsList clients={stats.topClients} />
              </div>
              <div>
                <p className="text-xs text-center text-muted-foreground mb-2">Period B</p>
                <TopClientsList clients={stats.comparisonStats?.topClients || []} />
              </div>
            </div>
          ) : stats.topClients.length > 0 ? (
            <div className="space-y-3">
              {stats.topClients.map((client, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{client.name}</p>
                    <p className="text-xs text-muted-foreground">{client.orders} orders</p>
                  </div>
                  <div className="flex-shrink-0">
                    <div 
                      className="h-1.5 rounded-full bg-primary/20" 
                      style={{ width: `${Math.max(40, (client.orders / (stats.topClients[0]?.orders || 1)) * 80)}px` }}
                    >
                      <div 
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${(client.orders / (stats.topClients[0]?.orders || 1)) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
              No client data in this period
            </div>
          )}
        </div>
      </div>


      {/* Order Activity Heatmap */}
      <OrderActivityHeatmap />

      {/* Supplier Scorecard */}
      <SupplierScorecard />

      {/* Period Summary */}
      {comparisonMode ? (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20 rounded-xl p-6">
            <p className="text-xs font-medium text-primary mb-1">Period A</p>
            <p className="text-sm text-muted-foreground">
              {format(dateRange.from, "MMM d, yyyy")} — {format(dateRange.to, "MMM d, yyyy")}
            </p>
            <p className="text-3xl font-bold mt-2">{stats.ordersInRange} orders</p>
          </div>
          <div className="bg-gradient-to-br from-amber-500/5 to-amber-500/10 border border-amber-500/20 rounded-xl p-6">
            <p className="text-xs font-medium text-amber-600 mb-1">Period B</p>
            <p className="text-sm text-muted-foreground">
              {format(comparisonRange.from, "MMM d, yyyy")} — {format(comparisonRange.to, "MMM d, yyyy")}
            </p>
            <p className="text-3xl font-bold mt-2">{stats.comparisonStats?.ordersInRange || 0} orders</p>
            {comparisonChange !== 0 && (
              <div className={`inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded-full text-xs font-medium ${
                comparisonChange >= 0 
                  ? 'bg-emerald-500/10 text-emerald-600' 
                  : 'bg-red-500/10 text-red-600'
              }`}>
                {comparisonChange >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                {Math.abs(comparisonChange)}% difference
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20 rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">
                {format(dateRange.from, "MMM d, yyyy")} — {format(dateRange.to, "MMM d, yyyy")}
              </p>
              <p className="text-3xl font-bold mt-1">{stats.ordersInRange} orders</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper function to merge chart data for comparison
function mergeChartData(
  dataA: { period: string; orders: number }[], 
  dataB: { period: string; orders: number }[]
): { period: string; ordersA: number; ordersB: number }[] {
  const maxLen = Math.max(dataA.length, dataB.length);
  const result = [];
  
  for (let i = 0; i < maxLen; i++) {
    result.push({
      period: dataA[i]?.period || dataB[i]?.period || `Period ${i + 1}`,
      ordersA: dataA[i]?.orders || 0,
      ordersB: dataB[i]?.orders || 0,
    });
  }
  
  return result;
}

// Sub-components
function StatusPieChart({ data }: { data: { name: string; value: number; color: string }[] }) {
  if (data.length === 0) {
    return (
      <div className="h-32 flex items-center justify-center text-muted-foreground text-xs">
        No data
      </div>
    );
  }
  
  return (
    <div className="h-32">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={25}
            outerRadius={45}
            paddingAngle={3}
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

function TopItemsList({ items, color }: { items: { name: string; quantity: number }[]; color: string }) {
  if (items.length === 0) {
    return <p className="text-xs text-muted-foreground text-center py-4">No items</p>;
  }
  
  const maxQty = items[0]?.quantity || 1;
  
  return (
    <div className="space-y-2">
      {items.slice(0, 4).map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground truncate flex-1">{item.name}</span>
          <div className="w-16 h-1.5 rounded-full bg-muted">
            <div 
              className="h-full rounded-full" 
              style={{ width: `${(item.quantity / maxQty) * 100}%`, backgroundColor: color }}
            />
          </div>
          <span className="text-xs font-medium w-6 text-right">{item.quantity}</span>
        </div>
      ))}
    </div>
  );
}

function TopClientsList({ clients }: { clients: { name: string; orders: number }[] }) {
  if (clients.length === 0) {
    return <p className="text-xs text-muted-foreground text-center py-4">No clients</p>;
  }
  
  return (
    <div className="space-y-2">
      {clients.slice(0, 4).map((client, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-xs font-medium text-primary w-4">{i + 1}</span>
          <span className="text-xs text-muted-foreground truncate flex-1">{client.name}</span>
          <span className="text-xs font-medium">{client.orders}</span>
        </div>
      ))}
    </div>
  );
}

interface MetricCardProps {
  label: string;
  value: string | number;
  comparisonValue?: string | number;
  icon: React.ReactNode;
  showComparison?: boolean;
}

function MetricCard({ label, value, comparisonValue, icon, showComparison }: MetricCardProps) {
  return (
    <div className="bg-card border border-border rounded-xl p-5 transition-all hover:shadow-sm">
      <div className="flex items-start justify-between">
        <div className="p-2 rounded-lg bg-primary/10 text-primary">
          {icon}
        </div>
      </div>
      <div className="mt-4">
        <div className="flex items-baseline gap-2">
          <p className="text-2xl font-bold tracking-tight">{value}</p>
          {showComparison && comparisonValue !== undefined && (
            <p className="text-sm text-amber-600 font-medium">vs {comparisonValue}</p>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      </div>
    </div>
  );
}
