import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useParallax } from "@/hooks/useParallax";
import {
  Package, CheckCircle2, Clock, TrendingUp, Building2, Truck,
  AlertTriangle, ArrowRight, GripVertical, RotateCcw, LayoutGrid,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { AnimatedCounter } from "@/components/ui/AnimatedCounter";
import PredictiveInsights from "./PredictiveInsights";
import AnalyticsWidgets from "./AnalyticsWidgets";
import LeaderboardWidget from "./LeaderboardWidget";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";

const LAYOUT_KEY = "dashboard-widget-layout";

type WidgetId = "stats" | "quickStats" | "recentActivity" | "urgentAlerts" | "predictive" | "analytics" | "leaderboard";

interface WidgetConfig {
  id: WidgetId;
  label: string;
  visible: boolean;
}

const DEFAULT_LAYOUT: WidgetConfig[] = [
  { id: "stats", label: "Stat Cards", visible: true },
  { id: "analytics", label: "Analytics Charts", visible: true },
  { id: "leaderboard", label: "Leaderboard", visible: true },
  { id: "urgentAlerts", label: "Urgent Alerts", visible: true },
  { id: "quickStats", label: "Quick Stats", visible: true },
  { id: "recentActivity", label: "Recent Activity", visible: true },
  { id: "predictive", label: "Predictive Insights", visible: true },
];

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

interface UrgentOrder {
  id: string;
  order_number: string;
  urgency: string;
  status: string;
  created_at: string;
}

// ─── Sortable Widget Wrapper ───
function SortableWidget({ id, children, isEditing }: { id: string; children: React.ReactNode; isEditing: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative group",
        isDragging && "z-50 opacity-80",
        isEditing && "ring-2 ring-primary/20 ring-dashed rounded-xl"
      )}
    >
      {isEditing && (
        <div
          {...attributes}
          {...listeners}
          className="absolute -top-2 -left-2 z-10 p-1.5 bg-card border border-border rounded-lg cursor-grab active:cursor-grabbing shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      )}
      {children}
    </div>
  );
}

// ─── Parallax Wrapper ───
function ParallaxWrapper({ children, speed = 0.03 }: { children: React.ReactNode; speed?: number }) {
  const { ref, style } = useParallax(speed);
  return <div ref={ref} style={style}>{children}</div>;
}

function ParallaxStatCards({ statCards, stats }: { statCards: any[]; stats: Stats }) {
  const { ref, style } = useParallax(0.03);
  return (
    <div ref={ref} style={style} className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {statCards.map((stat) => (
        <Card key={stat.label} className="cursor-pointer glass-card glow-border interactive-scale hover:shadow-glow transition-all duration-300 border-border/50" onClick={stat.onClick}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <stat.icon className={`h-5 w-5 ${stat.color}`} />
              {stat.label === "Active Orders" && stats.urgentOrders > 0 && (
                <Badge variant="destructive" className="text-[10px] px-1.5 py-0">{stats.urgentOrders} urgent</Badge>
              )}
            </div>
            <AnimatedCounter value={stat.value} className="text-2xl font-bold text-foreground" />
            <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Main Component ───
interface CustomizableDashboardProps {
  userName?: string;
  onNavigate: (view: string) => void;
}

export default function CustomizableDashboard({ userName, onNavigate }: CustomizableDashboardProps) {
  const [stats, setStats] = useState<Stats>({
    totalActive: 0, awaitingStock: 0, inProgress: 0, ready: 0,
    completedThisMonth: 0, totalClients: 0, totalSuppliers: 0, urgentOrders: 0,
  });
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [urgentOrders, setUrgentOrders] = useState<UrgentOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [layout, setLayout] = useState<WidgetConfig[]>(DEFAULT_LAYOUT);
  const [isEditing, setIsEditing] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Load saved layout
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LAYOUT_KEY);
      if (saved) {
        const parsed: WidgetConfig[] = JSON.parse(saved);
        // Merge with defaults to handle new widgets
        const merged = DEFAULT_LAYOUT.map(def => {
          const saved = parsed.find(p => p.id === def.id);
          return saved || def;
        });
        // Preserve saved order
        const ordered = parsed
          .filter(p => merged.some(m => m.id === p.id))
          .map(p => merged.find(m => m.id === p.id)!);
        const missing = merged.filter(m => !ordered.some(o => o.id === m.id));
        setLayout([...ordered, ...missing]);
      }
    } catch {
      // use defaults
    }
  }, []);

  // Persist layout
  const saveLayout = useCallback((newLayout: WidgetConfig[]) => {
    setLayout(newLayout);
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(newLayout));
  }, []);

  // Fetch data
  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      const [ordersRes, completedRes, clientsRes, suppliersRes, activityRes, urgentRes] = await Promise.all([
        supabase.from("orders").select("id, status, urgency").neq("status", "delivered"),
        supabase.from("orders").select("id").eq("status", "delivered").gte("completed_date", startOfMonth),
        supabase.from("companies").select("id", { count: "exact", head: true }),
        supabase.from("suppliers").select("id", { count: "exact", head: true }),
        supabase.from("order_activity_log").select("id, title, description, activity_type, created_at, order_id").order("created_at", { ascending: false }).limit(8),
        supabase.from("orders").select("id, order_number, urgency, status, created_at").in("urgency", ["urgent", "high"]).neq("status", "delivered").order("created_at", { ascending: false }).limit(5),
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
      setUrgentOrders(urgentRes.data || []);
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = layout.findIndex(w => w.id === active.id);
    const newIndex = layout.findIndex(w => w.id === over.id);
    saveLayout(arrayMove(layout, oldIndex, newIndex));
  };

  const toggleWidget = (id: WidgetId) => {
    saveLayout(layout.map(w => w.id === id ? { ...w, visible: !w.visible } : w));
  };

  const resetLayout = () => {
    saveLayout([...DEFAULT_LAYOUT]);
  };

  const activityIcon = (type: string) => {
    switch (type) {
      case "status_change": return <ArrowRight className="h-3.5 w-3.5 text-primary" />;
      case "created": return <Package className="h-3.5 w-3.5 text-emerald-500" />;
      case "file_upload": return <TrendingUp className="h-3.5 w-3.5 text-sky-500" />;
      default: return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  const statCards = [
    { label: "Active Orders", value: stats.totalActive, icon: Package, color: "text-primary", onClick: () => onNavigate("orders") },
    { label: "Awaiting Stock", value: stats.awaitingStock, icon: Clock, color: "text-amber-500", onClick: () => onNavigate("orders") },
    { label: "In Progress", value: stats.inProgress, icon: TrendingUp, color: "text-sky-500", onClick: () => onNavigate("orders") },
    { label: "Ready", value: stats.ready, icon: CheckCircle2, color: "text-emerald-500", onClick: () => onNavigate("orders") },
  ];

  // Widget renderers
  const renderWidget = (widget: WidgetConfig) => {
    if (!widget.visible) return null;
    switch (widget.id) {
      case "stats":
        return <ParallaxStatCards statCards={statCards} stats={stats} />;

      case "urgentAlerts":
        return (
          <ParallaxWrapper speed={0.02}>
            <Card className="glass-card glow-border border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  Urgent & High Priority
                </CardTitle>
              </CardHeader>
              <CardContent>
                {urgentOrders.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No urgent orders 🎉</p>
                ) : (
                  <div className="space-y-2">
                    {urgentOrders.map(order => (
                      <button
                        key={order.id}
                        onClick={() => onNavigate("orders")}
                        className="flex items-center justify-between w-full p-3 rounded-xl bg-destructive/5 hover:bg-destructive/10 transition-colors border border-destructive/10"
                      >
                        <div className="flex items-center gap-3">
                          <AlertTriangle className="h-4 w-4 text-destructive" />
                          <span className="text-sm font-medium text-foreground">{order.order_number}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px] border-destructive/30 text-destructive">
                            {order.urgency}
                          </Badge>
                          <span className="text-[11px] text-muted-foreground">
                            {formatDistanceToNow(new Date(order.created_at), { addSuffix: true })}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </ParallaxWrapper>
        );

      case "quickStats":
        return (
          <ParallaxWrapper speed={0.025}>
            <Card className="glass-card glow-border border-border/50">
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
          </ParallaxWrapper>
        );

      case "recentActivity":
        return (
          <ParallaxWrapper speed={0.02}>
            <Card className="glass-card glow-border border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">Recent Activity</CardTitle>
              </CardHeader>
              <CardContent>
                {recentActivity.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No recent activity yet.</p>
                ) : (
                  <div className="space-y-1">
                    {recentActivity.map(activity => (
                      <div key={activity.id} className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-secondary/30 transition-colors">
                        <div className="mt-0.5 shrink-0">{activityIcon(activity.activity_type)}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{activity.title}</p>
                          {activity.description && <p className="text-xs text-muted-foreground truncate">{activity.description}</p>}
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
          </ParallaxWrapper>
        );

      case "predictive":
        return <ParallaxWrapper speed={0.015}><PredictiveInsights /></ParallaxWrapper>;

      case "analytics":
        return <ParallaxWrapper speed={0.02}><AnalyticsWidgets /></ParallaxWrapper>;

      case "leaderboard":
        return <ParallaxWrapper speed={0.018}><LeaderboardWidget /></ParallaxWrapper>;

      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <div className="shimmer h-8 w-64 mb-2" />
          <div className="shimmer h-4 w-96" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="glass-card glow-border rounded-xl p-4">
              <div className="shimmer h-5 w-5 rounded mb-3" />
              <div className="shimmer h-8 w-16 mb-1" />
              <div className="shimmer h-3 w-20" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const visibleWidgets = layout.filter(w => w.visible);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Greeting + Controls */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Welcome{userName ? `, ${userName}` : ''}
          </h1>
          <p className="text-muted-foreground mt-1">Here's what's happening with your orders today.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant={isEditing ? "default" : "outline"}
            size="sm"
            onClick={() => setIsEditing(!isEditing)}
            className="rounded-xl gap-1.5"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            {isEditing ? "Done" : "Customize"}
          </Button>
          {isEditing && (
            <Button variant="ghost" size="sm" onClick={resetLayout} className="rounded-xl gap-1.5 text-muted-foreground">
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </Button>
          )}
        </div>
      </div>

      {/* Widget toggles when editing */}
      {isEditing && (
        <div className="flex flex-wrap gap-2 p-3 bg-muted/50 rounded-xl border border-border">
          <span className="text-xs text-muted-foreground mr-1 self-center">Toggle widgets:</span>
          {layout.map(w => (
            <button
              key={w.id}
              onClick={() => toggleWidget(w.id)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border",
                w.visible
                  ? "bg-primary/10 text-primary border-primary/20"
                  : "bg-muted text-muted-foreground border-border"
              )}
            >
              {w.label}
            </button>
          ))}
        </div>
      )}

      {/* Draggable widgets */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={visibleWidgets.map(w => w.id)} strategy={rectSortingStrategy}>
          <div className="space-y-4">
            {visibleWidgets.map(widget => (
              <SortableWidget key={widget.id} id={widget.id} isEditing={isEditing}>
                {renderWidget(widget)}
              </SortableWidget>
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
