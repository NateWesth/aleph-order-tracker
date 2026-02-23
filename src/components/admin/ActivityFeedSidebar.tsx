import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import {
  Activity,
  Package,
  FileUp,
  MessageSquare,
  ArrowRightLeft,
  ShoppingCart,
  ChevronRight,
  ChevronLeft,
  RefreshCw,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface ActivityItem {
  id: string;
  order_id: string;
  activity_type: string;
  title: string;
  description: string | null;
  metadata: Record<string, any> | null;
  user_id: string | null;
  created_at: string;
  user_name?: string;
  order_number?: string;
}

const ACTIVITY_CONFIG: Record<string, { icon: typeof Package; color: string; bg: string }> = {
  created: { icon: Package, color: "text-emerald-500", bg: "bg-emerald-500/10" },
  status_change: { icon: ArrowRightLeft, color: "text-blue-500", bg: "bg-blue-500/10" },
  file_upload: { icon: FileUp, color: "text-amber-500", bg: "bg-amber-500/10" },
  message: { icon: MessageSquare, color: "text-purple-500", bg: "bg-purple-500/10" },
  po_added: { icon: ShoppingCart, color: "text-rose-500", bg: "bg-rose-500/10" },
};

const DEFAULT_CONFIG = { icon: Activity, color: "text-muted-foreground", bg: "bg-muted" };

export default function ActivityFeedSidebar() {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [newCount, setNewCount] = useState(0);
  const lastFetchRef = useRef<string | null>(null);

  const fetchActivities = async () => {
    setLoading(true);
    try {
      // Fetch recent activity logs
      const { data: logs, error } = await supabase
        .from("order_activity_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(30);

      if (error) {
        console.error("Error fetching activity:", error);
        return;
      }

      if (!logs || logs.length === 0) {
        setActivities([]);
        setLoading(false);
        return;
      }

      // Get unique user IDs and order IDs
      const userIds = [...new Set(logs.map((l) => l.user_id).filter(Boolean))] as string[];
      const orderIds = [...new Set(logs.map((l) => l.order_id))];

      // Fetch profiles and order numbers in parallel
      const [profilesRes, ordersRes] = await Promise.all([
        userIds.length > 0
          ? supabase.from("profiles").select("id, full_name").in("id", userIds)
          : { data: [] },
        supabase.from("orders").select("id, order_number").in("id", orderIds),
      ]);

      const profileMap = new Map(
        (profilesRes.data || []).map((p) => [p.id, p.full_name])
      );
      const orderMap = new Map(
        (ordersRes.data || []).map((o) => [o.id, o.order_number])
      );

      const enriched: ActivityItem[] = logs.map((log) => ({
        ...log,
        metadata: log.metadata as Record<string, any> | null,
        user_name: log.user_id ? profileMap.get(log.user_id) || "Unknown" : "System",
        order_number: orderMap.get(log.order_id) || "Unknown",
      }));

      // Track new items since last fetch
      if (lastFetchRef.current) {
        const newItems = enriched.filter(
          (a) => a.created_at > lastFetchRef.current!
        );
        if (newItems.length > 0 && collapsed) {
          setNewCount((prev) => prev + newItems.length);
        }
      }

      lastFetchRef.current = enriched[0]?.created_at || null;
      setActivities(enriched);
    } catch (error) {
      console.error("Activity fetch error:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActivities();

    // Real-time subscription
    const channel = supabase
      .channel("activity-feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "order_activity_log" },
        () => {
          fetchActivities();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleExpand = () => {
    setCollapsed(false);
    setNewCount(0);
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const getConfig = (type: string) => ACTIVITY_CONFIG[type] || DEFAULT_CONFIG;

  return (
    <div
      className={cn(
        "hidden lg:flex flex-col border-l border-border/20 bg-card/15 backdrop-blur-2xl transition-all duration-300",
        "fixed top-0 right-0 h-full z-40",
        collapsed ? "w-12" : "w-72 xl:w-80"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-2 border-b border-border shrink-0">
        {!collapsed && (
          <div className="flex items-center gap-2 px-1">
            <Activity className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">Activity</span>
            <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
              Live
            </Badge>
          </div>
        )}
        <div className="flex items-center gap-0.5">
          {!collapsed && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={fetchActivities}>
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 relative"
            onClick={collapsed ? handleExpand : () => setCollapsed(true)}
          >
            {collapsed ? (
              <>
                <ChevronLeft className="h-3.5 w-3.5" />
                {newCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center text-[9px] font-bold bg-primary text-primary-foreground rounded-full px-1">
                    {newCount > 9 ? "9+" : newCount}
                  </span>
                )}
              </>
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>

      {/* Collapsed mini view */}
      {collapsed && (
        <div className="flex-1 flex flex-col items-center gap-1 py-2 overflow-hidden">
          {activities.slice(0, 8).map((activity) => {
            const config = getConfig(activity.activity_type);
            const Icon = config.icon;
            return (
              <div
                key={activity.id}
                className={cn("p-1.5 rounded-lg cursor-pointer", config.bg)}
                title={`${activity.title} - ${activity.order_number}`}
                onClick={handleExpand}
              >
                <Icon className={cn("h-3.5 w-3.5", config.color)} />
              </div>
            );
          })}
        </div>
      )}

      {/* Expanded feed */}
      {!collapsed && (
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-0.5">
            {loading && activities.length === 0 && (
              <>
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex gap-2.5 p-2">
                    <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  </div>
                ))}
              </>
            )}

            {!loading && activities.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Activity className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-xs">No activity yet</p>
              </div>
            )}

            {activities.map((activity, index) => {
              const config = getConfig(activity.activity_type);
              const Icon = config.icon;
              const isNew =
                index === 0 &&
                activity.created_at &&
                Date.now() - new Date(activity.created_at).getTime() < 60000;

              return (
                <div
                  key={activity.id}
                  className={cn(
                    "group flex gap-2.5 p-2 rounded-lg transition-colors hover:bg-accent/50 cursor-default",
                    isNew && "bg-primary/5 animate-fade-in"
                  )}
                >
                  {/* Avatar */}
                  <div className="relative shrink-0">
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-[10px] font-semibold text-muted-foreground">
                      {activity.user_name === "System" ? (
                        <User className="h-3.5 w-3.5" />
                      ) : (
                        getInitials(activity.user_name || "?")
                      )}
                    </div>
                    <div
                      className={cn(
                        "absolute -bottom-0.5 -right-0.5 p-0.5 rounded-full",
                        config.bg
                      )}
                    >
                      <Icon className={cn("h-2.5 w-2.5", config.color)} />
                    </div>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-1">
                      <p className="text-xs font-medium text-foreground leading-tight line-clamp-2">
                        {activity.title}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[10px] text-muted-foreground truncate">
                        {activity.user_name}
                      </span>
                      <span className="text-[10px] text-muted-foreground">·</span>
                      <Badge
                        variant="outline"
                        className="text-[9px] h-4 px-1 shrink-0"
                      >
                        {activity.order_number}
                      </Badge>
                    </div>
                    {activity.description && (
                      <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">
                        {activity.description}
                      </p>
                    )}
                    <span className="text-[10px] text-muted-foreground/70 mt-0.5 block">
                      {formatDistanceToNow(new Date(activity.created_at), {
                        addSuffix: true,
                      })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
