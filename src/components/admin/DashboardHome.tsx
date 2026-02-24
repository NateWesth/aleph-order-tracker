import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Package, CheckCircle2, Clock, AlertTriangle, TrendingUp, Building2, Truck, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { AnimatedCounter } from "@/components/ui/AnimatedCounter";
import PredictiveInsights from "./PredictiveInsights";
import { PageSkeleton } from "@/components/ui/PageSkeleton";

interface DashboardHomeProps {
  userName?: string;
  onNavigate: (view: string) => void;
}

interface Stats {
  totalActive: number;
  awaitingStock: number;
  inProgress: number;
  ready: number;
  completedThisMonth: number;
  totalClients: number;
  totalSuppliers: number;
  urgentOrders: number;
}

interface RecentActivity {
  id: string;
  title: string;
  description: string | null;
  activity_type: string;
  created_at: string;
  order_id: string;
}

export default function DashboardHome({ userName, onNavigate }: DashboardHomeProps) {
  const [stats, setStats] = useState<Stats>({
    totalActive: 0, awaitingStock: 0, inProgress: 0, ready: 0,
    completedThisMonth: 0, totalClients: 0, totalSuppliers: 0, urgentOrders: 0,
  });
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      const [ordersRes, completedRes, clientsRes, suppliersRes, activityRes] = await Promise.all([
        supabase.from("orders").select("id, status, urgency").neq("status", "delivered"),
        supabase.from("orders").select("id").eq("status", "delivered").gte("completed_date", startOfMonth),
        supabase.from("companies").select("id", { count: "exact", head: true }),
        supabase.from("suppliers").select("id", { count: "exact", head: true }),
        supabase.from("order_activity_log").select("id, title, description, activity_type, created_at, order_id").order("created_at", { ascending: false }).limit(8),
      ]);

      const activeOrders = ordersRes.data || [];
      setStats({
        totalActive: activeOrders.length,
        awaitingStock: activeOrders.filter(o => o.status === "ordered").length,
        inProgress: activeOrders.filter(o => o.status === "in-stock" || o.status === "in-progress").length,
        ready: activeOrders.filter(o => o.status === "ready").length,
        completedThisMonth: completedRes.data?.length || 0,
        totalClients: clientsRes.count || 0,
        totalSuppliers: suppliersRes.count || 0,
        urgentOrders: activeOrders.filter(o => o.urgency === "urgent" || o.urgency === "high").length,
      });

      setRecentActivity(activityRes.data || []);
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  const activityIcon = (type: string) => {
    switch (type) {
      case "status_change": return <ArrowRight className="h-3.5 w-3.5 text-primary" />;
      case "created": return <Package className="h-3.5 w-3.5 text-emerald-500" />;
      case "file_upload": return <TrendingUp className="h-3.5 w-3.5 text-sky-500" />;
      default: return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  if (loading) {
    return <PageSkeleton variant="dashboard" />;
  }

  const statCards = [
    { label: "Active Orders", value: stats.totalActive, icon: Package, color: "text-primary", onClick: () => onNavigate("orders") },
    { label: "Awaiting Stock", value: stats.awaitingStock, icon: Clock, color: "text-amber-500", onClick: () => onNavigate("orders") },
    { label: "In Progress", value: stats.inProgress, icon: TrendingUp, color: "text-sky-500", onClick: () => onNavigate("orders") },
    { label: "Ready", value: stats.ready, icon: CheckCircle2, color: "text-emerald-500", onClick: () => onNavigate("orders") },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          Welcome{userName ? `, ${userName}` : ''}
        </h1>
        <p className="text-muted-foreground mt-1">Here's what's happening with your orders today.</p>
      </div>

      {/* Stat Cards — Glass + Glow + Animated Counters */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {statCards.map((stat, i) => (
          <Card
            key={stat.label}
            className="cursor-pointer float-surface glass-card glow-border interactive-scale hover-lift transition-all duration-300 border-border/50"
            style={{ animationDelay: `${i * 80}ms` }}
            onClick={stat.onClick}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
                {stat.label === "Active Orders" && stats.urgentOrders > 0 && (
                  <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                    {stats.urgentOrders} urgent
                  </Badge>
                )}
              </div>
              <AnimatedCounter value={stat.value} className="text-2xl font-bold text-foreground" />
              <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Second row: Quick stats + Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Quick Actions & Stats */}
        <Card className="float-surface glass-card glow-border border-border/50 interactive-scale hover-lift">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Quick Stats</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <button onClick={() => onNavigate("history")} className="flex items-center justify-between w-full p-3 rounded-xl bg-secondary/50 hover:bg-secondary transition-colors">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <span className="text-sm font-medium text-foreground">Completed this month</span>
              </div>
              <AnimatedCounter value={stats.completedThisMonth} className="text-lg font-bold text-foreground" />
            </button>
            <button onClick={() => onNavigate("clients")} className="flex items-center justify-between w-full p-3 rounded-xl bg-secondary/50 hover:bg-secondary transition-colors">
              <div className="flex items-center gap-3">
                <Building2 className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium text-foreground">Clients</span>
              </div>
              <AnimatedCounter value={stats.totalClients} className="text-lg font-bold text-foreground" />
            </button>
            <button onClick={() => onNavigate("suppliers")} className="flex items-center justify-between w-full p-3 rounded-xl bg-secondary/50 hover:bg-secondary transition-colors">
              <div className="flex items-center gap-3">
                <Truck className="h-4 w-4 text-violet-500" />
                <span className="text-sm font-medium text-foreground">Suppliers</span>
              </div>
              <AnimatedCounter value={stats.totalSuppliers} className="text-lg font-bold text-foreground" />
            </button>

            <Button onClick={() => onNavigate("orders")} variant="outline" className="w-full mt-2 rounded-xl">
              <Package className="h-4 w-4 mr-2" />
              Go to Orders Board
            </Button>
          </CardContent>
        </Card>

        {/* Recent Activity Feed */}
        <Card className="lg:col-span-2 float-surface glass-card glow-border border-border/50 interactive-scale hover-lift">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {recentActivity.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No recent activity yet.</p>
            ) : (
              <div className="space-y-1">
                {recentActivity.map((activity) => (
                  <div key={activity.id} className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-secondary/30 transition-colors">
                    <div className="mt-0.5 shrink-0">{activityIcon(activity.activity_type)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{activity.title}</p>
                      {activity.description && (
                        <p className="text-xs text-muted-foreground truncate">{activity.description}</p>
                      )}
                    </div>
                    <span className="text-[11px] text-muted-foreground whitespace-nowrap shrink-0">
                      {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Predictive Intelligence */}
      <PredictiveInsights />
    </div>
  );
}
