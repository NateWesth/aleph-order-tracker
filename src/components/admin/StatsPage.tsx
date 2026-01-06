import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { 
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area
} from "recharts";
import { 
  Package, TrendingUp, Clock, Users,
  ArrowUpRight, ArrowDownRight
} from "lucide-react";
import { format, subMonths, startOfMonth, endOfMonth, differenceInDays, startOfYear, subYears } from "date-fns";

interface OrderStats {
  totalOrders: number;
  ordersThisMonth: number;
  ordersLastMonth: number;
  ordersThisYear: number;
  ordersLastYear: number;
  avgCompletionDays: number;
  ordersByStatus: { name: string; value: number; color: string }[];
  ordersByMonth: { month: string; orders: number }[];
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

export default function StatsPage() {
  const [stats, setStats] = useState<OrderStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const now = new Date();
      const thisMonthStart = startOfMonth(now);
      const lastMonthStart = startOfMonth(subMonths(now, 1));
      const lastMonthEnd = endOfMonth(subMonths(now, 1));
      const thisYearStart = startOfYear(now);
      const lastYearStart = startOfYear(subYears(now, 1));
      const lastYearEnd = new Date(subYears(now, 1).getFullYear(), 11, 31);

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
      
      const ordersThisMonth = orders?.filter(o => 
        new Date(o.created_at!) >= thisMonthStart
      ).length || 0;

      const ordersLastMonth = orders?.filter(o => {
        const date = new Date(o.created_at!);
        return date >= lastMonthStart && date <= lastMonthEnd;
      }).length || 0;

      const ordersThisYear = orders?.filter(o => 
        new Date(o.created_at!) >= thisYearStart
      ).length || 0;

      const ordersLastYear = orders?.filter(o => {
        const date = new Date(o.created_at!);
        return date >= lastYearStart && date <= lastYearEnd;
      }).length || 0;

      const completedOrders = orders?.filter(o => (o.status === "completed" || o.status === "delivered") && o.completed_date) || [];
      const avgCompletionDays = completedOrders.length > 0
        ? completedOrders.reduce((acc, o) => {
            const days = differenceInDays(new Date(o.completed_date!), new Date(o.created_at!));
            return acc + days;
          }, 0) / completedOrders.length
        : 0;

      const statusCounts: Record<string, number> = {};
      orders?.forEach(o => {
        const status = o.status || "pending";
        statusCounts[status] = (statusCounts[status] || 0) + 1;
      });
      const ordersByStatus = Object.entries(statusCounts).map(([name, value]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1).replace("-", " "),
        value,
        color: STATUS_COLORS[name] || "#94a3b8",
      }));

      const ordersByMonth = [];
      for (let i = 5; i >= 0; i--) {
        const monthDate = subMonths(now, i);
        const monthStart = startOfMonth(monthDate);
        const monthEnd = endOfMonth(monthDate);

        const count = orders?.filter(o => {
          const date = new Date(o.created_at!);
          return date >= monthStart && date <= monthEnd;
        }).length || 0;

        ordersByMonth.push({
          month: format(monthDate, "MMM"),
          orders: count,
        });
      }

      const itemCounts: Record<string, number> = {};
      orderItems?.forEach(item => {
        const name = item.name;
        itemCounts[name] = (itemCounts[name] || 0) + item.quantity;
      });
      const topItems = Object.entries(itemCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([name, quantity]) => ({ name: name.length > 15 ? name.slice(0, 15) + "…" : name, quantity }));

      const clientCounts: Record<string, number> = {};
      orders?.forEach(o => {
        const companyName = (o.companies as any)?.name || "Unknown";
        clientCounts[companyName] = (clientCounts[companyName] || 0) + 1;
      });
      const topClients = Object.entries(clientCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([name, orderCount]) => ({ name: name.length > 12 ? name.slice(0, 12) + "…" : name, orders: orderCount }));

      setStats({
        totalOrders,
        ordersThisMonth,
        ordersLastMonth,
        ordersThisYear,
        ordersLastYear,
        avgCompletionDays: Math.round(avgCompletionDays * 10) / 10,
        ordersByStatus,
        ordersByMonth,
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

  const monthChange = stats.ordersLastMonth > 0
    ? Math.round(((stats.ordersThisMonth - stats.ordersLastMonth) / stats.ordersLastMonth) * 100)
    : stats.ordersThisMonth > 0 ? 100 : 0;

  const yearChange = stats.ordersLastYear > 0
    ? Math.round(((stats.ordersThisYear - stats.ordersLastYear) / stats.ordersLastYear) * 100)
    : stats.ordersThisYear > 0 ? 100 : 0;

  return (
    <div className="space-y-8 pb-8">
      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Total Orders"
          value={stats.totalOrders}
          icon={<Package className="h-5 w-5" />}
        />
        <MetricCard
          label="This Month"
          value={stats.ordersThisMonth}
          change={monthChange}
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
              <AreaChart data={stats.ordersByMonth}>
                <defs>
                  <linearGradient id="orderGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis 
                  dataKey="month" 
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
              {stats.ordersByStatus.map((status, i) => (
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
              ))}
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
              No items data available
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
              No client data available
            </div>
          )}
        </div>
      </div>

      {/* Year Summary */}
      <div className="bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20 rounded-xl p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">This Year</p>
            <p className="text-3xl font-bold mt-1">{stats.ordersThisYear} orders</p>
          </div>
          <div className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium ${
            yearChange >= 0 
              ? 'bg-emerald-500/10 text-emerald-600' 
              : 'bg-red-500/10 text-red-600'
          }`}>
            {yearChange >= 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
            {Math.abs(yearChange)}% vs last year
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
