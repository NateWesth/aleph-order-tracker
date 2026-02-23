import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  CirclePlus, ArrowRightLeft, FileUp, Link2, MessageSquare, 
  Package, Loader2 
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
  created: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  status_change: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  file_upload: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  po_added: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  message: "bg-cyan-500/10 text-cyan-600 border-cyan-500/20",
  item_updated: "bg-orange-500/10 text-orange-600 border-orange-500/20",
};

interface OrderActivityTimelineProps {
  orderId: string;
}

export default function OrderActivityTimeline({ orderId }: OrderActivityTimelineProps) {
  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchActivities = async () => {
      setLoading(true);
      try {
        // Fetch activity logs
        const { data: logs, error } = await supabase
          .from("order_activity_log")
          .select("*")
          .eq("order_id", orderId)
          .order("created_at", { ascending: false })
          .limit(50);

        if (error) throw error;

        // Also fetch order_updates (messages) to include in timeline
        const { data: updates } = await supabase
          .from("order_updates")
          .select("id, message, user_id, created_at")
          .eq("order_id", orderId)
          .order("created_at", { ascending: false })
          .limit(20);

        // Collect unique user IDs
        const userIds = new Set<string>();
        logs?.forEach(l => l.user_id && userIds.add(l.user_id));
        updates?.forEach(u => u.user_id && userIds.add(u.user_id));

        // Fetch user names
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

        // Combine logs and messages
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

        // Sort by date descending
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
    <ScrollArea className="h-[400px] pr-4">
      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-[19px] top-6 bottom-6 w-px bg-border" />

        <div className="space-y-1">
          {activities.map((activity, i) => {
            const iconColor = ACTIVITY_COLORS[activity.activity_type] || ACTIVITY_COLORS.item_updated;
            const icon = ACTIVITY_ICONS[activity.activity_type] || <Package className="h-4 w-4" />;
            const isFirst = i === 0;

            return (
              <div key={activity.id} className="relative flex gap-3 py-2">
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
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                    {activity.userName && <span>{activity.userName}</span>}
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
  );
}
