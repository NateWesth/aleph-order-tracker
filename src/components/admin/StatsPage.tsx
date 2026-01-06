import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { 
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area
} from "recharts";
import { 
  Package, TrendingUp, Clock, Users,
  ArrowUpRight, ArrowDownRight, Calendar
} from "lucide-react";
import { format, subMonths, startOfMonth, endOfMonth, differenceInDays, startOfYear, subDays, isWithinInterval, eachMonthOfInterval } from "date-fns";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

type PresetKey = "7d" | "30d" | "90d" | "year" | "all";

interface DateRange {
  from: Date;
  to: Date;
}

interface OrderStats {
  totalOrders: number;
  ordersInRange: number;
  ordersPrevRange: number;
  avgCompletionDays: number;
  ordersByStatus: { name: string; value: number; color: string }[];
  ordersByPeriod: { period: string; orders: number }[];
  topItems: { name: string; quantity: number }[];
  topClients: { name: string; orders: number }[];
  totalClients: number;
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
  const to = endOfMonth(now);
  
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

      // Filter orders within date range
      const ordersInRange = orders?.filter(o => {
        const date = new Date(o.created_at!);
        return isWithinInterval(date, { start: dateRange.from, end: dateRange.to });
      }) || [];

      // Calculate previous range for comparison
      const rangeDuration = dateRange.to.getTime() - dateRange.from.getTime();
      const prevRangeStart = new Date(dateRange.from.getTime() - rangeDuration);
      const prevRangeEnd = new Date(dateRange.from.getTime() - 1);

      const ordersPrevRange = orders?.filter(o => {
        const date = new Date(o.created_at!);
        return isWithinInterval(date, { start: prevRangeStart, end: prevRangeEnd });
      }).length || 0;

      // Average completion time for orders in range
      const completedOrdersInRange = ordersInRange.filter(o => 
        (o.status === "completed" || o.status === "delivered") && o.completed_date
      );
      const avgCompletionDays = completedOrdersInRange.length > 0
        ? completedOrdersInRange.reduce((acc, o) => {
            const days = differenceInDays(new Date(o.completed_date!), new Date(o.created_at!));
            return acc + days;
          }, 0) / completedOrdersInRange.length
        : 0;

      // Orders by status (within range)
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

      // Orders by period (dynamic based on range)
      const months = eachMonthOfInterval({ start: dateRange.from, end: dateRange.to });
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

      // Top items (within range)
      const orderIdsInRange = new Set(ordersInRange.map(o => o.id));
      const itemsInRange = orderItems?.filter(item => orderIdsInRange.has(item.order_id)) || [];
      
      const itemCounts: Record<string, number> = {};
      itemsInRange.forEach(item => {
        const name = item.name;
        itemCounts[name] = (itemCounts[name] || 0) + item.quantity;
      });
      const topItems = Object.entries(itemCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([name, quantity]) => ({ name: name.length > 15 ? name.slice(0, 15) + "…" : name, quantity }));

      // Top clients (within range)
      const clientCounts: Record<string, number> = {};
      ordersInRange.forEach(o => {
        const companyName = (o.companies as any)?.name || "Unknown";
        clientCounts[companyName] = (clientCounts[companyName] || 0) + 1;
      });
      const topClients = Object.entries(clientCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([name, orderCount]) => ({ name: name.length > 12 ? name.slice(0, 12) + "…" : name, orders: orderCount }));

      setStats({
        totalOrders,
        ordersInRange: ordersInRange.length,
        ordersPrevRange,
        avgCompletionDays: Math.round(avgCompletionDays * 10) / 10,
        ordersByStatus,
        ordersByPeriod,
        topItems,
        topClients,
        totalClients,
      });
    } catch (error) {
      console.error("Error fetching stats:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Unable to load statistics</p>
      </div>
    );
  }

  const rangeChange = stats.ordersPrevRange > 0
    ? Math.round(((stats.ordersInRange - stats.ordersPrevRange) / stats.ordersPrevRange) * 100)
    : stats.ordersInRange > 0 ? 100 : 0;

  return (
    <div className="space-y-6 pb-8">
      {/* Date Range Filter */}
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
              className={cn("text-xs gap-1.5", isCustom && "bg-primary")}
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
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Total Orders"
          value={stats.totalOrders}
          icon={<Package className="h-5 w-5" />}
        />
        <MetricCard
          label="In Period"
          value={stats.ordersInRange}
          change={rangeChange}
          icon={<TrendingUp className="h-5 w-5" />}
        />
        <MetricCard
          label="Avg. Completion"
          value={`${stats.avgCompletionDays}d`}
          icon={<Clock className="h-5 w-5" />}
        />
        <MetricCard
          label="Total Clients"
          value={stats.totalClients}
          icon={<Users className="h-5 w-5" />}
        />
      </div>

      {/* Charts Grid */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Orders Trend */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="text-sm font-medium text-muted-foreground mb-6">Orders Trend</h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.ordersByPeriod}>
                <defs>
                  <linearGradient id="orderGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
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
                <Area 
                  type="monotone" 
                  dataKey="orders" 
                  stroke="hsl(var(--primary))" 
                  strokeWidth={2}
                  fill="url(#orderGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Status Distribution */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="text-sm font-medium text-muted-foreground mb-6">Status Distribution</h3>
          <div className="flex items-center gap-6">
            <div className="h-40 w-40 flex-shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats.ordersByStatus}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={65}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {stats.ordersByStatus.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
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
        </div>

        {/* Top Items */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="text-sm font-medium text-muted-foreground mb-6">Top Items</h3>
          {stats.topItems.length > 0 ? (
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

        {/* Top Clients */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="text-sm font-medium text-muted-foreground mb-6">Top Clients</h3>
          {stats.topClients.length > 0 ? (
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

      {/* Period Summary */}
      <div className="bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20 rounded-xl p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">
              {format(dateRange.from, "MMM d, yyyy")} — {format(dateRange.to, "MMM d, yyyy")}
            </p>
            <p className="text-3xl font-bold mt-1">{stats.ordersInRange} orders</p>
          </div>
          <div className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium ${
            rangeChange >= 0 
              ? 'bg-emerald-500/10 text-emerald-600' 
              : 'bg-red-500/10 text-red-600'
          }`}>
            {rangeChange >= 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
            {Math.abs(rangeChange)}% vs prev period
          </div>
        </div>
      </div>
    </div>
  );
}

interface MetricCardProps {
  label: string;
  value: string | number;
  change?: number;
  icon: React.ReactNode;
}

function MetricCard({ label, value, change, icon }: MetricCardProps) {
  return (
    <div className="bg-card border border-border rounded-xl p-5 transition-all hover:shadow-sm">
      <div className="flex items-start justify-between">
        <div className="p-2 rounded-lg bg-primary/10 text-primary">
          {icon}
        </div>
        {change !== undefined && (
          <div className={`flex items-center gap-0.5 text-xs font-medium ${
            change >= 0 ? 'text-emerald-600' : 'text-red-600'
          }`}>
            {change >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {Math.abs(change)}%
          </div>
        )}
      </div>
      <div className="mt-4">
        <p className="text-2xl font-bold tracking-tight">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      </div>
    </div>
  );
}
