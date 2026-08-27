import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, Package, Truck, UserRoundCheck, Warehouse } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLiveData } from "@/hooks/useLiveData";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface OperationsHomePageProps { onNavigate: (view: string) => void; }
interface Brief { activeOrders: number; urgent: number; readyDeliveries: number; openCollections: number; myTasks: number; completedToday: number; }

export default function OperationsHomePage({ onNavigate }: OperationsHomePageProps) {
  const { user } = useAuth();
  const [brief, setBrief] = useState<Brief>({ activeOrders: 0, urgent: 0, readyDeliveries: 0, openCollections: 0, myTasks: 0, completedToday: 0 });
  const [loading, setLoading] = useState(true);

  const fetchBrief = useCallback(async () => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const s = supabase as any;
    const [orders, readyItems, collections, tasks, completed] = await Promise.all([
      s.from("orders").select("id,urgency,status").neq("status", "delivered"),
      s.from("order_items").select("id,qty_invoiced,qty_completed").gt("qty_invoiced", 0),
      s.from("po_collection_state").select("purchase_order_id,status"),
      user?.id ? s.from("team_action_items").select("id,status").eq("assigned_to", user.id).neq("status", "done") : Promise.resolve({ data: [] }),
      s.from("orders").select("id,completed_date").eq("status", "delivered").gte("completed_date", today.toISOString()),
    ]);
    const openOrders = orders.data || [];
    setBrief({
      activeOrders: openOrders.length,
      urgent: openOrders.filter((o: any) => o.urgency === "urgent").length,
      readyDeliveries: (readyItems.data || []).filter((i: any) => Number(i.qty_invoiced || 0) > Number(i.qty_completed || 0)).length,
      openCollections: (collections.data || []).filter((c: any) => c.status !== "collected").length,
      myTasks: (tasks.data || []).length,
      completedToday: (completed.data || []).length,
    });
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { void fetchBrief(); }, [fetchBrief]);
  useLiveData(["orders", "order_items", "po_collection_state", "team_action_items"], () => void fetchBrief(), { channelName: "operations-home-live" });

  const cards = [
    { label: "Open orders", value: brief.activeOrders, icon: Package, go: "orders", note: brief.urgent ? `${brief.urgent} urgent` : "No urgent orders" },
    { label: "Ready to dispatch", value: brief.readyDeliveries, icon: Truck, go: "fulfillment", note: "Delivery-ready line items" },
    { label: "Collections", value: brief.openCollections, icon: Warehouse, go: "fulfillment", note: "Open supplier collections" },
    { label: "My work", value: brief.myTasks, icon: UserRoundCheck, go: "my-work", note: "Assigned action items" },
  ];

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Badge variant="secondary" className="rounded-full">Today</Badge>
          <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">Good morning</h1>
          <p className="mt-1 text-sm text-muted-foreground">A simple view of the work that is actually open right now.</p>
        </div>
        <Button onClick={() => onNavigate("my-work")} className="w-fit rounded-xl">My Work <ArrowRight className="ml-2 h-4 w-4" /></Button>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {cards.map((item) => (
          <Card key={item.label} className="cursor-pointer border-border/55 transition hover:border-primary/25 hover:shadow-md" onClick={() => onNavigate(item.go)}>
            <CardContent className="p-4 sm:p-5">
              <item.icon className="h-5 w-5 text-primary" />
              <p className="mt-4 text-2xl font-black">{loading ? "—" : item.value}</p>
              <p className="text-sm font-bold">{item.label}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{item.note}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-border/55">
        <CardContent className="p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                {brief.urgent > 0 ? <AlertTriangle className="h-5 w-5 text-amber-600" /> : <CheckCircle2 className="h-5 w-5 text-emerald-600" />}
                <h2 className="font-black">{brief.urgent > 0 ? `${brief.urgent} urgent order${brief.urgent === 1 ? "" : "s"}` : "No urgent orders"}</h2>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{brief.completedToday} order{brief.completedToday === 1 ? "" : "s"} completed today.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => onNavigate("orders")}>Open orders</Button>
              <Button variant="outline" size="sm" onClick={() => onNavigate("fulfillment")}>Open dispatch</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
