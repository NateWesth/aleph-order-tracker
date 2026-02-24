import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { 
  CirclePlus, ArrowRightLeft, FileUp, Link2, MessageSquare, 
  Package, Loader2, Filter
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

interface ActivityEvent {
  id: string;
  activity_type: string;
  title: string;
  description: string | null;
  metadata: any;
  created_at: string;
  user_id: string | null;
  userName?: string;
}

const ACTIVITY_ICONS: Record<string, React.ReactNode> = {
  created: <CirclePlus className="h-4 w-4" />,
  status_change: <ArrowRightLeft className="h-4 w-4" />,
  file_upload: <FileUp className="h-4 w-4" />,
  po_added: <Link2 className="h-4 w-4" />,
  message: <MessageSquare className="h-4 w-4" />,
  item_updated: <Package className="h-4 w-4" />,
};

const ACTIVITY_COLORS: Record<string, string> = {
  created: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  status_change: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  file_upload: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
  po_added: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  message: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20",
  item_updated: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20",
};

const FILTER_OPTIONS = [
  { key: "all", label: "All" },
  { key: "status_change", label: "Status" },
  { key: "file_upload", label: "Files" },
  { key: "po_added", label: "POs" },
  { key: "message", label: "Messages" },
  { key: "created", label: "Created" },
];

interface OrderActivityTimelineProps {
  orderId: string;
}

export default function OrderActivityTimeline({ orderId }: OrderActivityTimelineProps) {
  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState("all");

  useEffect(() => {
    const fetchActivities = async () => {
      setLoading(true);
      try {
        const { data: logs, error } = await supabase
          .from("order_activity_log")
          .select("*")
          .eq("order_id", orderId)
          .order("created_at", { ascending: false })
          .limit(50);

        if (error) throw error;

        const { data: updates } = await supabase
          .from("order_updates")
          .select("id, message, user_id, created_at")
          .eq("order_id", orderId)
          .order("created_at", { ascending: false })
          .limit(20);

        const userIds = new Set<string>();
        logs?.forEach(l => l.user_id && userIds.add(l.user_id));
        updates?.forEach(u => u.user_id && userIds.add(u.user_id));

        let userMap: Record<string, string> = {};
        if (userIds.size > 0) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id, full_name")
            .in("id", Array.from(userIds));
          profiles?.forEach(p => {
            userMap[p.id] = p.full_name || "Unknown User";
          });
        }

        const combinedActivities: ActivityEvent[] = [
          ...(logs || []).map(l => ({
            ...l,
            userName: l.user_id ? userMap[l.user_id] : undefined,
          })),
          ...(updates || []).map(u => ({
            id: u.id,
            activity_type: "message",
            title: "Message posted",
            description: u.message.length > 120 ? u.message.slice(0, 120) + "…" : u.message,
            metadata: {},
            created_at: u.created_at,
            user_id: u.user_id,
            userName: userMap[u.user_id] || "Unknown",
          })),
        ];

        combinedActivities.sort((a, b) => 
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );

        setActivities(combinedActivities);
      } catch (error) {
        console.error("Error fetching activity timeline:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchActivities();
  }, [orderId]);

  const filteredActivities = filterType === "all" 
    ? activities 
    : activities.filter(a => a.activity_type === filterType);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        No activity recorded yet. Future status changes, file uploads, and messages will appear here.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Filter chips */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <Filter className="h-3.5 w-3.5 text-muted-foreground" />
        {FILTER_OPTIONS.map(opt => (
          <Button
            key={opt.key}
            size="sm"
            variant={filterType === opt.key ? "default" : "outline"}
            className="h-7 text-xs rounded-full px-3"
            onClick={() => setFilterType(opt.key)}
          >
            {opt.label}
            {opt.key !== "all" && (
              <span className="ml-1 opacity-60">
                {activities.filter(a => opt.key === "all" || a.activity_type === opt.key).length}
              </span>
            )}
          </Button>
        ))}
      </div>

      <ScrollArea className="h-[400px] pr-4">
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-[19px] top-6 bottom-6 w-px bg-border" />

          <div className="space-y-1">
            {filteredActivities.map((activity, i) => {
              const iconColor = ACTIVITY_COLORS[activity.activity_type] || ACTIVITY_COLORS.item_updated;
              const icon = ACTIVITY_ICONS[activity.activity_type] || <Package className="h-4 w-4" />;
              const isFirst = i === 0;

              return (
                <div key={activity.id} className={cn(
                  "relative flex gap-3 py-2.5 px-2 rounded-lg transition-colors",
                  isFirst && "bg-muted/30"
                )}>
                  {/* Icon */}
                  <div className={cn(
                    "relative z-10 flex items-center justify-center h-10 w-10 rounded-full border shrink-0",
                    iconColor,
                    isFirst && "ring-2 ring-primary/20"
                  )}>
                    {icon}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 pt-1">
                    <p className="text-sm font-medium leading-tight">{activity.title}</p>
                    {activity.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {activity.description}
                      </p>
                    )}
                    {/* Status change metadata */}
                    {activity.activity_type === "status_change" && activity.metadata?.old_status && (
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">
                          {activity.metadata.old_status}
                        </span>
                        <ArrowRightLeft className="h-3 w-3 text-muted-foreground" />
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
                          {activity.metadata.new_status}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                      {activity.userName && <span className="font-medium">{activity.userName}</span>}
                      {activity.userName && <span>•</span>}
                      <span title={format(new Date(activity.created_at), "PPpp")}>
                        {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
