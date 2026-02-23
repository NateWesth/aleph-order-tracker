import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, Clock } from "lucide-react";
import { differenceInDays, format } from "date-fns";

interface OverdueOrder {
  id: string;
  order_number: string;
  status: string;
  urgency: string;
  created_at: string;
  companyName: string;
  daysOpen: number;
}

// Threshold in days based on urgency
const THRESHOLDS: Record<string, number> = {
  high: 3,
  medium: 7,
  normal: 14,
  low: 21,
};

export default function OverdueAlerts() {
  const [overdueOrders, setOverdueOrders] = useState<OverdueOrder[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const fetchOverdue = async () => {
      const { data: orders } = await supabase
        .from("orders")
        .select("id, order_number, status, urgency, created_at, companies(name)")
        .not("status", "in", '("completed","delivered")')
        .order("created_at", { ascending: true });

      if (!orders) return;

      const now = new Date();
      const overdue = orders
        .map(o => {
          const daysOpen = differenceInDays(now, new Date(o.created_at!));
          const threshold = THRESHOLDS[o.urgency || "normal"] || 14;
          return {
            id: o.id,
            order_number: o.order_number,
            status: o.status || "pending",
            urgency: o.urgency || "normal",
            created_at: o.created_at!,
            companyName: (o.companies as any)?.name || "Unknown",
            daysOpen,
            isOverdue: daysOpen > threshold,
          };
        })
        .filter(o => o.isOverdue)
        .sort((a, b) => b.daysOpen - a.daysOpen);

      setOverdueOrders(overdue);
    };

    fetchOverdue();
    const interval = setInterval(fetchOverdue, 5 * 60 * 1000); // refresh every 5min
    return () => clearInterval(interval);
  }, []);

  if (overdueOrders.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 border-red-500/30 text-red-600 hover:bg-red-500/10">
          <AlertTriangle className="h-4 w-4" />
          <span>{overdueOrders.length} Overdue</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            Overdue Orders ({overdueOrders.length})
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[400px]">
          <div className="space-y-3">
            {overdueOrders.map(order => (
              <div key={order.id} className="flex items-start justify-between p-3 rounded-lg border border-border bg-card">
                <div className="space-y-1 min-w-0">
                  <p className="text-sm font-semibold">{order.order_number}</p>
                  <p className="text-xs text-muted-foreground truncate">{order.companyName}</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary" className="text-xs">{order.status}</Badge>
                    <Badge
                      variant="secondary"
                      className={`text-xs ${
                        order.urgency === "high" ? "bg-red-500/10 text-red-600" : ""
                      }`}
                    >
                      {order.urgency}
                    </Badge>
                  </div>
                </div>
                <div className="text-right shrink-0 ml-3">
                  <div className="flex items-center gap-1 text-red-500">
                    <Clock className="h-3.5 w-3.5" />
                    <span className="text-sm font-bold">{order.daysOpen}d</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {format(new Date(order.created_at), "dd MMM")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
