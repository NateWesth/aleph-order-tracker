import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend, AreaChart, Area
} from "recharts";
import { 
  Package, TrendingUp, Clock, Building2, 
  CheckCircle, AlertTriangle, Hourglass, ShoppingCart
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
  ordersByMonth: { month: string; orders: number; lastYear: number }[];
  topItems: { name: string; quantity: number }[];
  topClients: { name: string; orders: number }[];
  urgencyBreakdown: { name: string; value: number; color: string }[];
  completionTrend: { month: string; avgDays: number }[];
}

const STATUS_COLORS: Record<string, string> = {
  pending: "hsl(var(--chart-1))",
  ordered: "hsl(var(--chart-2))",
  "in-stock": "hsl(var(--chart-3))",
  processing: "hsl(var(--chart-4))",
  completed: "hsl(var(--chart-5))",
};

const URGENCY_COLORS: Record<string, string> = {
  low: "hsl(142, 76%, 36%)",
  normal: "hsl(221, 83%, 53%)",
  high: "hsl(38, 92%, 50%)",
  urgent: "hsl(0, 84%, 60%)",
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

      // Fetch all orders
      const { data: orders, error: ordersError } = await supabase
        .from("orders")
        .select("*, companies(name)");

      if (ordersError) throw ordersError;

      // Fetch all order items with item names
      const { data: orderItems, error: itemsError } = await supabase
        .from("order_items")
        .select("name, quantity, order_id");

      if (itemsError) throw itemsError;

      // Calculate stats
      const totalOrders = orders?.length || 0;
      
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

      // Average completion time
      const completedOrders = orders?.filter(o => o.status === "completed" && o.completed_date) || [];
      const avgCompletionDays = completedOrders.length > 0
        ? completedOrders.reduce((acc, o) => {
            const days = differenceInDays(new Date(o.completed_date!), new Date(o.created_at!));
            return acc + days;
          }, 0) / completedOrders.length
        : 0;

      // Orders by status
      const statusCounts: Record<string, number> = {};
      orders?.forEach(o => {
        const status = o.status || "pending";
        statusCounts[status] = (statusCounts[status] || 0) + 1;
      });
      const ordersByStatus = Object.entries(statusCounts).map(([name, value]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1).replace("-", " "),
        value,
        color: STATUS_COLORS[name] || "hsl(var(--muted))",
      }));

      // Orders by month (last 12 months)
      const ordersByMonth = [];
      for (let i = 11; i >= 0; i--) {
        const monthDate = subMonths(now, i);
        const monthStart = startOfMonth(monthDate);
        const monthEnd = endOfMonth(monthDate);
        const lastYearMonthStart = startOfMonth(subYears(monthDate, 1));
        const lastYearMonthEnd = endOfMonth(subYears(monthDate, 1));

        const count = orders?.filter(o => {
          const date = new Date(o.created_at!);
          return date >= monthStart && date <= monthEnd;
        }).length || 0;

        const lastYearCount = orders?.filter(o => {
          const date = new Date(o.created_at!);
          return date >= lastYearMonthStart && date <= lastYearMonthEnd;
        }).length || 0;

        ordersByMonth.push({
          month: format(monthDate, "MMM"),
          orders: count,
          lastYear: lastYearCount,
        });
      }

      // Top ordered items
      const itemCounts: Record<string, number> = {};
      orderItems?.forEach(item => {
        const name = item.name;
        itemCounts[name] = (itemCounts[name] || 0) + item.quantity;
      });
      const topItems = Object.entries(itemCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 8)
        .map(([name, quantity]) => ({ name: name.length > 20 ? name.slice(0, 20) + "..." : name, quantity }));

      // Top clients
      const clientCounts: Record<string, number> = {};
      orders?.forEach(o => {
        const companyName = (o.companies as any)?.name || "Unknown";
        clientCounts[companyName] = (clientCounts[companyName] || 0) + 1;
      });
      const topClients = Object.entries(clientCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 6)
        .map(([name, orderCount]) => ({ name, orders: orderCount }));

      // Urgency breakdown
      const urgencyCounts: Record<string, number> = {};
      orders?.forEach(o => {
        const urgency = o.urgency || "normal";
        urgencyCounts[urgency] = (urgencyCounts[urgency] || 0) + 1;
      });
      const urgencyBreakdown = Object.entries(urgencyCounts).map(([name, value]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        value,
        color: URGENCY_COLORS[name] || "hsl(var(--muted))",
      }));

      // Completion time trend (last 6 months)
      const completionTrend = [];
      for (let i = 5; i >= 0; i--) {
        const monthDate = subMonths(now, i);
        const monthStart = startOfMonth(monthDate);
        const monthEnd = endOfMonth(monthDate);
        
        const monthCompleted = completedOrders.filter(o => {
          const date = new Date(o.completed_date!);
          return date >= monthStart && date <= monthEnd;
        });

        const avgDays = monthCompleted.length > 0
          ? monthCompleted.reduce((acc, o) => {
              return acc + differenceInDays(new Date(o.completed_date!), new Date(o.created_at!));
            }, 0) / monthCompleted.length
          : 0;

        completionTrend.push({
          month: format(monthDate, "MMM"),
          avgDays: Math.round(avgDays * 10) / 10,
        });
      }

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
        urgencyBreakdown,
        completionTrend,
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
        <p className="text-muted-foreground">Loading statistics...</p>
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
    : 0;

  const yearChange = stats.ordersLastYear > 0
    ? Math.round(((stats.ordersThisYear - stats.ordersLastYear) / stats.ordersLastYear) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Total Orders</p>
                <p className="text-2xl font-bold">{stats.totalOrders}</p>
              </div>
              <Package className="h-8 w-8 text-primary opacity-80" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">This Month</p>
                <p className="text-2xl font-bold">{stats.ordersThisMonth}</p>
                <p className={`text-xs ${monthChange >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {monthChange >= 0 ? "+" : ""}{monthChange}% vs last month
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-primary opacity-80" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">This Year</p>
                <p className="text-2xl font-bold">{stats.ordersThisYear}</p>
                <p className={`text-xs ${yearChange >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {yearChange >= 0 ? "+" : ""}{yearChange}% vs last year
                </p>
              </div>
              <ShoppingCart className="h-8 w-8 text-primary opacity-80" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Avg. Completion</p>
                <p className="text-2xl font-bold">{stats.avgCompletionDays}</p>
                <p className="text-xs text-muted-foreground">days</p>
              </div>
              <Clock className="h-8 w-8 text-primary opacity-80" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 1 */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Orders Over Time */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Orders Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats.ordersByMonth}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px'
                    }}
                  />
                  <Legend />
                  <Area 
                    type="monotone" 
                    dataKey="orders" 
                    name="This Year"
                    stroke="hsl(var(--primary))" 
                    fill="hsl(var(--primary))" 
                    fillOpacity={0.3}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="lastYear" 
                    name="Last Year"
                    stroke="hsl(var(--muted-foreground))" 
                    fill="hsl(var(--muted-foreground))" 
                    fillOpacity={0.1}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Order Status Distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Order Status Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats.ordersByStatus}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {stats.ordersByStatus.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px'
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Most Ordered Items */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Most Ordered Items</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.topItems} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis 
                    dataKey="name" 
                    type="category" 
                    width={100}
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} 
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px'
                    }}
                  />
                  <Bar dataKey="quantity" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Top Clients */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Top Clients</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.topClients}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="name" 
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                    angle={-45}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px'
                    }}
                  />
                  <Bar dataKey="orders" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 3 */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Urgency Breakdown */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Urgency Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats.urgencyBreakdown}
                    cx="50%"
                    cy="50%"
                    outerRadius={70}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {stats.urgencyBreakdown.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px'
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Completion Time Trend */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Avg. Completion Time Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stats.completionTrend}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px'
                    }}
                    formatter={(value) => [`${value} days`, 'Avg. Days']}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="avgDays" 
                    stroke="hsl(var(--chart-4))" 
                    strokeWidth={2}
                    dot={{ fill: 'hsl(var(--chart-4))' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-green-500/10 border-green-500/20">
          <CardContent className="pt-4 flex items-center gap-3">
            <CheckCircle className="h-6 w-6 text-green-600" />
            <div>
              <p className="text-xs text-muted-foreground">Completed</p>
              <p className="text-xl font-bold">
                {stats.ordersByStatus.find(s => s.name === "Completed")?.value || 0}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-blue-500/10 border-blue-500/20">
          <CardContent className="pt-4 flex items-center gap-3">
            <Hourglass className="h-6 w-6 text-blue-600" />
            <div>
              <p className="text-xs text-muted-foreground">Processing</p>
              <p className="text-xl font-bold">
                {stats.ordersByStatus.find(s => s.name === "Processing")?.value || 0}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-yellow-500/10 border-yellow-500/20">
          <CardContent className="pt-4 flex items-center gap-3">
            <AlertTriangle className="h-6 w-6 text-yellow-600" />
            <div>
              <p className="text-xs text-muted-foreground">Pending</p>
              <p className="text-xl font-bold">
                {stats.ordersByStatus.find(s => s.name === "Pending")?.value || 0}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-purple-500/10 border-purple-500/20">
          <CardContent className="pt-4 flex items-center gap-3">
            <Building2 className="h-6 w-6 text-purple-600" />
            <div>
              <p className="text-xs text-muted-foreground">Total Clients</p>
              <p className="text-xl font-bold">{stats.topClients.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}