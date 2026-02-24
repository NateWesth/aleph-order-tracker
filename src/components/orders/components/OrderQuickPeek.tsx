import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Package, Clock, Truck, FileText, MessageSquare } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

interface OrderQuickPeekProps {
  orderId: string;
  orderNumber: string;
  companyName?: string;
  status?: string | null;
  urgency?: string | null;
  createdAt?: string | null;
}

interface PeekData {
  itemCount: number;
  fileCount: number;
  messageCount: number;
  poCount: number;
  lastActivity?: string;
}

export default function OrderQuickPeek({
  orderId,
  orderNumber,
  companyName,
  status,
  urgency,
  createdAt,
}: OrderQuickPeekProps) {
  const [data, setData] = useState<PeekData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPeekData = async () => {
      try {
        const [itemsRes, filesRes, messagesRes, posRes, activityRes] = await Promise.all([
          supabase.from("order_items").select("id", { count: "exact", head: true }).eq("order_id", orderId),
          supabase.from("order_files").select("id", { count: "exact", head: true }).eq("order_id", orderId),
          supabase.from("order_updates").select("id", { count: "exact", head: true }).eq("order_id", orderId),
          supabase.from("order_purchase_orders").select("id", { count: "exact", head: true }).eq("order_id", orderId),
          supabase.from("order_activity_log").select("title, created_at").eq("order_id", orderId).order("created_at", { ascending: false }).limit(1),
        ]);

        setData({
          itemCount: itemsRes.count || 0,
          fileCount: filesRes.count || 0,
          messageCount: messagesRes.count || 0,
          poCount: posRes.count || 0,
          lastActivity: activityRes.data?.[0]?.title,
        });
      } catch (error) {
        console.error("Error fetching peek data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchPeekData();
  }, [orderId]);

  const getUrgencyColor = (u: string | null | undefined) => {
    switch (u) {
      case "urgent": return "bg-destructive/10 text-destructive border-destructive/20";
      case "high": return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20";
      case "low": return "bg-muted text-muted-foreground border-border";
      default: return "bg-muted text-muted-foreground border-border";
    }
  };

  return (
    <div className="w-72 p-4 space-y-3">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between gap-2">
          <span className="font-bold text-sm text-foreground">{orderNumber}</span>
          {urgency && urgency !== "normal" && (
            <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", getUrgencyColor(urgency))}>
              {urgency}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{companyName || "No Client"}</p>
      </div>

      {/* Stats Grid */}
      {loading ? (
        <div className="grid grid-cols-2 gap-2">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-10 rounded-lg bg-muted/50 animate-pulse" />
          ))}
        </div>
      ) : data ? (
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
            <Package className="h-3.5 w-3.5 text-primary" />
            <div>
              <span className="text-sm font-semibold text-foreground">{data.itemCount}</span>
              <span className="text-[10px] text-muted-foreground ml-1">items</span>
            </div>
          </div>
          <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
            <FileText className="h-3.5 w-3.5 text-purple-500" />
            <div>
              <span className="text-sm font-semibold text-foreground">{data.fileCount}</span>
              <span className="text-[10px] text-muted-foreground ml-1">files</span>
            </div>
          </div>
          <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
            <MessageSquare className="h-3.5 w-3.5 text-cyan-500" />
            <div>
              <span className="text-sm font-semibold text-foreground">{data.messageCount}</span>
              <span className="text-[10px] text-muted-foreground ml-1">msgs</span>
            </div>
          </div>
          <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
            <Truck className="h-3.5 w-3.5 text-amber-500" />
            <div>
              <span className="text-sm font-semibold text-foreground">{data.poCount}</span>
              <span className="text-[10px] text-muted-foreground ml-1">POs</span>
            </div>
          </div>
        </div>
      ) : null}

      {/* Footer */}
      <div className="flex items-center justify-between pt-1 border-t border-border">
        {data?.lastActivity && (
          <p className="text-[10px] text-muted-foreground truncate flex-1">
            Latest: {data.lastActivity}
          </p>
        )}
        {createdAt && (
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground shrink-0 ml-2">
            <Clock className="h-3 w-3" />
            {formatDistanceToNow(new Date(createdAt), { addSuffix: true })}
          </div>
        )}
      </div>
    </div>
  );
}
