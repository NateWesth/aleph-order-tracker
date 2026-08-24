import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  CalendarClock,
  CheckCircle2,
  Clock3,
  MapPin,
  PackageCheck,
  RefreshCw,
  Search,
  Sparkles,
  Truck,
  UserRound,
  Users,
  Warehouse,
} from "lucide-react";

interface FulfillmentItem {
  id: string;
  name: string;
  code: string | null;
  quantity: number;
  qty_invoiced: number | null;
  qty_completed: number | null;
}

interface FulfillmentOrder {
  id: string;
  order_number: string;
  reference: string | null;
  urgency: string | null;
  company_id: string | null;
  created_at: string | null;
  fulfillment_method: "delivery" | "collection";
  fulfillment_status: "pending" | "scheduled" | "out-for-delivery" | "ready-for-collection" | "completed";
  fulfillment_assigned_to: string | null;
  fulfillment_scheduled_for: string | null;
  fulfillment_notes: string | null;
  fulfillment_routed_at: string | null;
  companyName: string;
  items: FulfillmentItem[];
}

interface TeamMember {
  id: string;
  full_name: string | null;
  email: string | null;
  position: string | null;
}

interface FulfillmentSettings {
  auto_assign_enabled: boolean;
  default_method: "delivery" | "collection";
}

const readyUnits = (item: FulfillmentItem) => Math.max(0, Math.min(item.qty_invoiced ?? 0, item.quantity) - Math.min(item.qty_completed ?? 0, item.quantity));

const statusLabel: Record<FulfillmentOrder["fulfillment_status"], string> = {
  pending: "Pending",
  scheduled: "Scheduled",
  "out-for-delivery": "Out for delivery",
  "ready-for-collection": "Ready for collection",
  completed: "Completed",
};

export default function FulfillmentPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [orders, setOrders] = useState<FulfillmentOrder[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [settings, setSettings] = useState<FulfillmentSettings>({ auto_assign_enabled: false, default_method: "delivery" });
  const [activeMode, setActiveMode] = useState<"delivery" | "collection">("delivery");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);
  const autoAssignLock = useRef(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [ordersRes, profilesRes, settingsRes] = await Promise.all([
        supabase
          .from("orders")
          .select("id, order_number, reference, urgency, company_id, created_at, fulfillment_method, fulfillment_status, fulfillment_assigned_to, fulfillment_scheduled_for, fulfillment_notes, fulfillment_routed_at")
          .neq("status", "delivered")
          .order("created_at", { ascending: true }),
        supabase.from("profiles").select("id, full_name, email, position").eq("approved", true).order("full_name"),
        supabase.from("fulfillment_settings").select("auto_assign_enabled, default_method").eq("id", true).maybeSingle(),
      ]);
      if (ordersRes.error) throw ordersRes.error;
      if (profilesRes.error) throw profilesRes.error;

      const baseOrders = ordersRes.data || [];
      const ids = baseOrders.map((order) => order.id);
      const companyIds = [...new Set(baseOrders.map((order) => order.company_id).filter(Boolean))] as string[];

      const [itemsRes, companiesRes] = await Promise.all([
        ids.length
          ? supabase.from("order_items").select("id, order_id, name, code, quantity, qty_invoiced, qty_completed").in("order_id", ids)
          : Promise.resolve({ data: [], error: null } as any),
        companyIds.length
          ? supabase.from("companies").select("id, name").in("id", companyIds)
          : Promise.resolve({ data: [], error: null } as any),
      ]);
      if (itemsRes.error) throw itemsRes.error;
      if (companiesRes.error) throw companiesRes.error;

      const itemMap = new Map<string, FulfillmentItem[]>();
      (itemsRes.data || []).forEach((item: any) => {
        const existing = itemMap.get(item.order_id) || [];
        existing.push(item);
        itemMap.set(item.order_id, existing);
      });
      const companyMap = new Map((companiesRes.data || []).map((company: any) => [company.id, company.name]));

      const ready = baseOrders
        .map((order: any) => ({
          ...order,
          fulfillment_method: (order.fulfillment_method || settingsRes.data?.default_method || "delivery") as "delivery" | "collection",
          fulfillment_status: (order.fulfillment_status || "pending") as FulfillmentOrder["fulfillment_status"],
          companyName: order.company_id ? companyMap.get(order.company_id) || "Unknown client" : "No client",
          items: itemMap.get(order.id) || [],
        }))
        .filter((order) => order.items.some((item) => readyUnits(item) > 0) && order.fulfillment_status !== "completed");

      setOrders(ready as FulfillmentOrder[]);
      setTeam((profilesRes.data || []) as TeamMember[]);
      if (settingsRes.data) setSettings(settingsRes.data as FulfillmentSettings);
    } catch (error: any) {
      console.error("Fulfillment load failed", error);
      toast({ title: "Could not load fulfillment", description: error.message || "Please try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void fetchData();
    const channel = supabase
      .channel("fulfillment-workspace")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => void fetchData())
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, () => void fetchData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  const updateOrder = async (orderId: string, patch: Record<string, unknown>) => {
    const previous = orders;
    setOrders((current) => current.map((order) => (order.id === orderId ? ({ ...order, ...patch } as FulfillmentOrder) : order)));
    const { error } = await supabase.from("orders").update(patch as any).eq("id", orderId);
    if (error) {
      setOrders(previous);
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
      return false;
    }
    return true;
  };

  const saveSettings = async (patch: Partial<FulfillmentSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    const { error } = await supabase
      .from("fulfillment_settings")
      .update({ ...patch, updated_at: new Date().toISOString(), updated_by: user?.id || null } as any)
      .eq("id", true);
    if (error) toast({ title: "Settings not saved", description: error.message, variant: "destructive" });
  };

  const autoAssign = useCallback(async (sourceOrders = orders, quiet = false) => {
    if (autoAssignLock.current || team.length === 0) return;
    const unassigned = sourceOrders.filter((order) => !order.fulfillment_assigned_to);
    if (unassigned.length === 0) return;
    autoAssignLock.current = true;
    setAssigning(true);
    try {
      const load = new Map(team.map((member) => [member.id, sourceOrders.filter((order) => order.fulfillment_assigned_to === member.id).length]));
      for (const order of unassigned) {
        const assignee = [...team].sort((a, b) => (load.get(a.id) || 0) - (load.get(b.id) || 0))[0];
        if (!assignee) break;
        const { error } = await supabase.from("orders").update({ fulfillment_assigned_to: assignee.id } as any).eq("id", order.id);
        if (!error) load.set(assignee.id, (load.get(assignee.id) || 0) + 1);
      }
      await fetchData();
      if (!quiet) toast({ title: "Auto assignment complete", description: `${unassigned.length} ready order${unassigned.length === 1 ? "" : "s"} balanced across the team.` });
    } finally {
      autoAssignLock.current = false;
      setAssigning(false);
    }
  }, [fetchData, orders, team, toast]);

  useEffect(() => {
    if (!loading && settings.auto_assign_enabled && orders.some((order) => !order.fulfillment_assigned_to)) {
      void autoAssign(orders, true);
    }
  }, [loading, settings.auto_assign_enabled, orders, autoAssign]);


  const completeFulfillment = async (order: FulfillmentOrder) => {
    const readyItems = order.items.filter((item) => readyUnits(item) > 0);
    if (readyItems.length === 0) return;
    try {
      await Promise.all(
        readyItems.map((item) =>
          supabase
            .from("order_items")
            .update({ qty_completed: Math.min(item.qty_invoiced ?? 0, item.quantity), updated_at: new Date().toISOString() } as any)
            .eq("id", item.id)
            .throwOnError(),
        ),
      );

      const completedIds = new Set(readyItems.map((item) => item.id));
      const fullyDone = order.items.length > 0 && order.items.every((item) => {
        const projected = completedIds.has(item.id)
          ? Math.min(item.qty_invoiced ?? 0, item.quantity)
          : Math.min(item.qty_completed ?? 0, item.quantity);
        return projected >= item.quantity;
      });

      const orderPatch = fullyDone
        ? { fulfillment_status: "completed", status: "delivered", completed_date: new Date().toISOString(), fulfillment_scheduled_for: null }
        : { fulfillment_status: "pending", fulfillment_scheduled_for: null };
      const { error } = await supabase.from("orders").update(orderPatch as any).eq("id", order.id);
      if (error) throw error;

      toast({
        title: order.fulfillment_method === "collection" ? "Collection completed" : "Delivery completed",
        description: fullyDone
          ? `${order.order_number} is fully completed and moved to history.`
          : `The ready quantities on ${order.order_number} were completed. Remaining items stay active.`,
      });
      await fetchData();
    } catch (error: any) {
      toast({ title: "Could not complete fulfillment", description: error.message || "Please try again.", variant: "destructive" });
    }
  };

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return orders.filter((order) => {
      if (order.fulfillment_method !== activeMode) return false;
      if (!needle) return true;
      return [order.order_number, order.reference, order.companyName, ...order.items.map((item) => `${item.code || ""} ${item.name}`)]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [orders, activeMode, query]);

  const counts = useMemo(() => ({
    delivery: orders.filter((order) => order.fulfillment_method === "delivery").length,
    collection: orders.filter((order) => order.fulfillment_method === "collection").length,
    unassigned: orders.filter((order) => !order.fulfillment_assigned_to).length,
    scheduled: orders.filter((order) => order.fulfillment_scheduled_for).length,
  }), [orders]);

  const memberName = (id: string | null) => team.find((member) => member.id === id)?.full_name || "Unassigned";

  return (
    <div className="space-y-5 pb-8">
      <section className="relative overflow-hidden rounded-[28px] border border-border/60 bg-card/85 p-5 shadow-xl backdrop-blur-xl sm:p-7">
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-primary/12 blur-3xl" />
        <div className="relative flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.22em] text-primary"><Truck className="h-4 w-4" /> Fulfillment control</div>
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Delivery & Collection</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Everything that reaches Ready for Delivery lands here automatically. Route it, assign it, schedule it, and finish it without cluttering the Orders board.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="rounded-xl" onClick={() => void fetchData()} disabled={loading}><RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />Refresh</Button>
            <Button className="rounded-xl" onClick={() => void autoAssign()} disabled={assigning || team.length === 0}><Sparkles className="mr-2 h-4 w-4" />{assigning ? "Assigning…" : "Auto assign now"}</Button>
          </div>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Deliveries", counts.delivery, Truck],
          ["Collections", counts.collection, Warehouse],
          ["Unassigned", counts.unassigned, Users],
          ["Scheduled", counts.scheduled, CalendarClock],
        ].map(([label, value, Icon]: any) => (
          <Card key={label} className="rounded-2xl border-border/60 shadow-sm"><CardContent className="flex items-center gap-4 p-4"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Icon className="h-5 w-5" /></div><div><p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</p><p className="text-2xl font-black">{value}</p></div></CardContent></Card>
        ))}
      </div>

      <section className="rounded-2xl border border-border/60 bg-card/75 p-3 shadow-sm sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-muted/50 p-1">
            <button onClick={() => setActiveMode("delivery")} className={cn("flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all", activeMode === "delivery" ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground")}><Truck className="h-4 w-4" />Delivery <Badge variant="secondary">{counts.delivery}</Badge></button>
            <button onClick={() => setActiveMode("collection")} className={cn("flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all", activeMode === "collection" ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground")}><Warehouse className="h-4 w-4" />Collection <Badge variant="secondary">{counts.collection}</Badge></button>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative min-w-0 sm:w-72"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search ready orders…" className="rounded-xl pl-9" /></div>
            <div className="flex items-center gap-2 rounded-xl border border-border/60 px-3 py-2"><Switch checked={settings.auto_assign_enabled} onCheckedChange={(checked) => void saveSettings({ auto_assign_enabled: checked })} /><div><p className="text-xs font-bold">Auto assign</p><p className="text-[10px] text-muted-foreground">Balance new ready orders</p></div></div>
            <Select value={settings.default_method} onValueChange={(value: "delivery" | "collection") => void saveSettings({ default_method: value })}><SelectTrigger className="w-[165px] rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="delivery">Default: Delivery</SelectItem><SelectItem value="collection">Default: Collection</SelectItem></SelectContent></Select>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="grid gap-3 lg:grid-cols-2">{[0,1,2,3].map((n) => <div key={n} className="h-64 animate-pulse rounded-3xl bg-muted/50" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border/70 bg-card/50 px-6 py-16 text-center"><PackageCheck className="mx-auto h-10 w-10 text-muted-foreground/40" /><h3 className="mt-4 font-bold">Nothing waiting for {activeMode}</h3><p className="mt-1 text-sm text-muted-foreground">Orders appear here as soon as invoiced quantities reach Ready for Delivery.</p></div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {filtered.map((order) => {
            const visibleItems = order.items.filter((item) => readyUnits(item) > 0);
            const unitCount = visibleItems.reduce((sum, item) => sum + readyUnits(item), 0);
            return (
              <Card key={order.id} className="group overflow-hidden rounded-3xl border-border/60 bg-card/90 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-xl">
                <CardContent className="p-0">
                  <div className="flex items-start justify-between gap-3 border-b border-border/50 p-4 sm:p-5">
                    <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-black text-primary">{order.order_number}</h3>{order.reference && <Badge variant="outline">SO: {order.reference}</Badge>}{order.urgency === "urgent" && <Badge variant="destructive">Urgent</Badge>}</div><p className="mt-1 truncate text-sm font-semibold">{order.companyName}</p><p className="mt-1 text-xs text-muted-foreground">{visibleItems.length} line{visibleItems.length === 1 ? "" : "s"} · {unitCount} unit{unitCount === 1 ? "" : "s"} ready</p></div>
                    <Badge className="shrink-0 rounded-full" variant="secondary">{statusLabel[order.fulfillment_status]}</Badge>
                  </div>

                  <div className="space-y-2 p-4 sm:p-5">
                    {visibleItems.map((item) => <div key={item.id} className="flex items-start gap-3 rounded-2xl bg-muted/40 px-3 py-2.5"><div className="rounded-xl bg-primary/10 px-2 py-1 text-xs font-black text-primary">×{readyUnits(item)}</div><div className="min-w-0 flex-1"><p className="break-words text-sm font-semibold">{item.name}</p>{item.code && <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{item.code}</p>}</div></div>)}
                  </div>

                  <div className="grid gap-3 border-t border-border/50 bg-muted/20 p-4 sm:grid-cols-2 sm:p-5">
                    <div><label className="mb-1.5 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-muted-foreground"><UserRound className="h-3.5 w-3.5" />Assigned to</label><Select value={order.fulfillment_assigned_to || "unassigned"} onValueChange={(value) => void updateOrder(order.id, { fulfillment_assigned_to: value === "unassigned" ? null : value })}><SelectTrigger className="rounded-xl"><SelectValue placeholder="Unassigned" /></SelectTrigger><SelectContent><SelectItem value="unassigned">Unassigned</SelectItem>{team.map((member) => <SelectItem key={member.id} value={member.id}>{member.full_name || member.email || "Team member"}</SelectItem>)}</SelectContent></Select></div>
                    <div><label className="mb-1.5 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-muted-foreground"><MapPin className="h-3.5 w-3.5" />Route</label><Select value={order.fulfillment_method} onValueChange={(value: "delivery" | "collection") => void updateOrder(order.id, { fulfillment_method: value, fulfillment_status: value === "collection" ? "ready-for-collection" : "pending", fulfillment_routed_at: new Date().toISOString() })}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="delivery">Delivery</SelectItem><SelectItem value="collection">Collection</SelectItem></SelectContent></Select></div>
                    <div><label className="mb-1.5 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-muted-foreground"><Clock3 className="h-3.5 w-3.5" />Status</label><Select value={order.fulfillment_status} onValueChange={(value) => void updateOrder(order.id, { fulfillment_status: value })}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pending">Pending</SelectItem><SelectItem value="scheduled">Scheduled</SelectItem>{order.fulfillment_method === "delivery" ? <SelectItem value="out-for-delivery">Out for delivery</SelectItem> : <SelectItem value="ready-for-collection">Ready for collection</SelectItem>}</SelectContent></Select></div>
                    <div><label className="mb-1.5 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-muted-foreground"><CalendarClock className="h-3.5 w-3.5" />Schedule</label><Input type="datetime-local" className="rounded-xl" value={order.fulfillment_scheduled_for ? new Date(order.fulfillment_scheduled_for).toISOString().slice(0,16) : ""} onChange={(e) => void updateOrder(order.id, { fulfillment_scheduled_for: e.target.value ? new Date(e.target.value).toISOString() : null, fulfillment_status: e.target.value ? "scheduled" : order.fulfillment_status })} /></div>
                    <div className="sm:col-span-2"><label className="mb-1.5 text-[10px] font-black uppercase tracking-wider text-muted-foreground">Fulfillment notes</label><Textarea defaultValue={order.fulfillment_notes || ""} placeholder={`Add ${order.fulfillment_method} instructions…`} className="min-h-20 resize-none rounded-xl" onBlur={(e) => { if (e.target.value !== (order.fulfillment_notes || "")) void updateOrder(order.id, { fulfillment_notes: e.target.value || null }); }} /></div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/50 p-4 sm:px-5"><p className="text-xs text-muted-foreground">{order.fulfillment_assigned_to ? `Assigned to ${memberName(order.fulfillment_assigned_to)}` : "Needs an assignee"}</p><Button size="sm" className="rounded-xl" onClick={() => void completeFulfillment(order)}><CheckCircle2 className="mr-2 h-4 w-4" />Complete {order.fulfillment_method}</Button></div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
