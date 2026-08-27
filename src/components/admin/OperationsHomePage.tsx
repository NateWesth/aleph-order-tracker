import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, ArrowRight, Bot, CheckCircle2, Clock3, Command, PackageCheck, Radar, Route, Sparkles, Truck, UserRoundCheck, Users, Warehouse } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLiveData } from "@/hooks/useLiveData";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import OnlinePresenceIndicator from "./OnlinePresenceIndicator";

interface OperationsHomePageProps { onNavigate: (view: string) => void; }
interface Brief { activeOrders: number; urgent: number; readyDeliveries: number; openCollections: number; exceptions: number; myTasks: number; routes: number; completedToday: number; }
interface Activity { id: string; title: string; description: string | null; created_at: string; }

export default function OperationsHomePage({ onNavigate }: OperationsHomePageProps) {
  const { user } = useAuth();
  const [brief, setBrief] = useState<Brief>({ activeOrders: 0, urgent: 0, readyDeliveries: 0, openCollections: 0, exceptions: 0, myTasks: 0, routes: 0, completedToday: 0 });
  const [activity, setActivity] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBrief = useCallback(async () => {
    const today = new Date(); today.setHours(0,0,0,0);
    const s = supabase as any;
    const [orders, readyItems, collections, exceptions, tasks, routes, completed, activityRes] = await Promise.all([
      s.from("orders").select("id,urgency,status", { count: "exact" }).neq("status", "delivered"),
      s.from("order_items").select("id,qty_invoiced,qty_completed").gt("qty_invoiced", 0),
      s.from("po_collection_state").select("purchase_order_id,status"),
      s.from("operations_exceptions").select("id,status").neq("status", "resolved"),
      user?.id ? s.from("team_action_items").select("id,status").eq("assigned_to", user.id).neq("status", "done") : Promise.resolve({ data: [] }),
      s.from("dispatch_routes").select("id,status,route_date").not("status", "in", "(completed,cancelled)"),
      s.from("orders").select("id,completed_date").eq("status", "delivered").gte("completed_date", today.toISOString()),
      s.from("order_activity_log").select("id,title,description,created_at").order("created_at", { ascending: false }).limit(8),
    ]);
    const openOrders = orders.data || [];
    const ready = (readyItems.data || []).filter((i: any) => Number(i.qty_invoiced || 0) > Number(i.qty_completed || 0)).length;
    setBrief({
      activeOrders: openOrders.length,
      urgent: openOrders.filter((o: any) => o.urgency === "urgent").length,
      readyDeliveries: ready,
      openCollections: (collections.data || []).filter((c: any) => c.status !== "collected").length,
      exceptions: (exceptions.data || []).length,
      myTasks: (tasks.data || []).length,
      routes: (routes.data || []).length,
      completedToday: (completed.data || []).length,
    });
    setActivity(activityRes.data || []);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { void fetchBrief(); }, [fetchBrief]);
  useLiveData(["orders","order_items","po_collection_state","operations_exceptions","team_action_items","dispatch_routes"], () => void fetchBrief(), { channelName: "operations-home-live" });

  const attention = useMemo(() => brief.urgent + brief.exceptions + brief.readyDeliveries + brief.openCollections, [brief]);
  const askAI = (prompt: string) => window.dispatchEvent(new CustomEvent("aleph:ask-ai", { detail: prompt }));

  const stats = [
    { label: "Needs attention", value: attention, icon: AlertTriangle, tone: "text-amber-600", go: "control-tower" },
    { label: "Ready deliveries", value: brief.readyDeliveries, icon: Truck, tone: "text-cyan-600", go: "fulfillment" },
    { label: "Supplier collections", value: brief.openCollections, icon: Warehouse, tone: "text-violet-600", go: "fulfillment" },
    { label: "My work", value: brief.myTasks, icon: UserRoundCheck, tone: "text-primary", go: "my-work" },
  ];

  return <div className="space-y-5 animate-in fade-in duration-300">
    <section className="relative overflow-hidden rounded-[28px] border border-primary/15 bg-gradient-to-br from-card via-card to-primary/[0.06] p-5 sm:p-7 shadow-[0_24px_70px_-52px_hsl(var(--primary)/.55)]">
      <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div><div className="mb-2 flex items-center gap-2"><Badge className="rounded-full">Today</Badge><OnlinePresenceIndicator /></div><h1 className="text-2xl font-black tracking-tight sm:text-4xl">Operations brief</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">One place for what needs action now: fulfillment, exceptions, assignments and team workload.</p></div>
        <div className="grid grid-cols-2 gap-2 sm:flex"><Button onClick={() => onNavigate("my-work")} className="rounded-xl"><UserRoundCheck className="mr-2 h-4 w-4"/>My Work</Button><Button variant="outline" onClick={() => onNavigate("control-tower")} className="rounded-xl"><Radar className="mr-2 h-4 w-4"/>Control Tower</Button><Button variant="outline" onClick={() => window.dispatchEvent(new Event("aleph:open-command"))} className="rounded-xl"><Command className="mr-2 h-4 w-4"/>Command</Button><Button variant="outline" onClick={() => askAI("What needs my attention today? Summarise urgent orders, fulfillment, collections, exceptions and assignments.")} className="rounded-xl"><Sparkles className="mr-2 h-4 w-4"/>Ask Aleph</Button></div>
      </div>
    </section>

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{stats.map((s) => <Card key={s.label} className="group cursor-pointer border-border/55 transition-all hover:-translate-y-0.5 hover:shadow-lg" onClick={() => onNavigate(s.go)}><CardContent className="p-4 sm:p-5"><div className="flex items-center justify-between"><s.icon className={`h-5 w-5 ${s.tone}`}/><ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1"/></div><p className="mt-4 text-2xl font-black">{loading ? "—" : s.value}</p><p className="text-xs font-semibold text-muted-foreground">{s.label}</p></CardContent></Card>)}</div>

    <div className="grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
      <Card className="border-border/55"><CardContent className="p-5"><div className="mb-4 flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-[.16em] text-muted-foreground">Morning brief</p><h2 className="text-lg font-black">Operational pulse</h2></div><Badge variant={attention > 0 ? "destructive" : "secondary"}>{attention} attention</Badge></div><div className="grid gap-2 sm:grid-cols-2">{[
        ["Active orders", brief.activeOrders, PackageCheck, "orders"], ["Urgent orders", brief.urgent, AlertTriangle, "orders"], ["Active routes", brief.routes, Route, "control-tower"], ["Completed today", brief.completedToday, CheckCircle2, "history"]
      ].map(([label,value,Icon,go]: any) => <button key={label} onClick={() => onNavigate(go)} className="flex items-center justify-between rounded-2xl border border-border/50 bg-muted/25 p-3 text-left hover:bg-muted/45"><span className="flex items-center gap-2 text-sm font-semibold"><Icon className="h-4 w-4 text-primary"/>{label}</span><strong>{value}</strong></button>)}</div></CardContent></Card>
      <Card className="border-border/55"><CardContent className="p-5"><div className="mb-4"><p className="text-xs font-black uppercase tracking-[.16em] text-muted-foreground">Live feed</p><h2 className="text-lg font-black">What the team is doing</h2></div><div className="space-y-2">{activity.length ? activity.map(a => <div key={a.id} className="rounded-xl bg-muted/30 p-3"><p className="text-sm font-bold">{a.title}</p>{a.description && <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{a.description}</p>}<p className="mt-1 text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}</p></div>) : <p className="text-sm text-muted-foreground">No recent activity.</p>}</div></CardContent></Card>
    </div>

    <Card className="border-primary/10 bg-primary/[.025]"><CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><Bot className="h-5 w-5 text-primary"/><h3 className="font-black">Aleph Operations Assistant</h3></div><p className="mt-1 text-xs text-muted-foreground">Ask operational questions instead of hunting through screens.</p></div><div className="flex flex-wrap gap-2">{["What is holding up orders?","Which deliveries should go first?","What should I buy today?"].map(q => <Button key={q} size="sm" variant="outline" className="rounded-full text-xs" onClick={() => askAI(q)}>{q}</Button>)}</div></CardContent></Card>
  </div>;
}
