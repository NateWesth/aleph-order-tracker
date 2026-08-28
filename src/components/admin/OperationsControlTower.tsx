import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useLiveData } from "@/hooks/useLiveData";
import { pendingOfflineOperationCount, subscribeOfflineQueue } from "@/services/offlineOperations";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Activity, AlertTriangle, ArrowUpRight, Bookmark, CheckCircle2, ChevronRight, CircleAlert, ClipboardCheck, CloudOff, Gauge, ListChecks, Loader2, MapPinned, Plus, Radar, RefreshCw, Route, Save, Search, ShieldAlert, Sparkles, Truck, UserRound, Users, Wrench, X } from "lucide-react";

type TowerTab = "overview" | "routes" | "team" | "map" | "exceptions" | "reconciliation" | "activity";
type Severity = "critical" | "high" | "medium" | "low";
type ExceptionStatus = "open" | "investigating" | "blocked" | "resolved";
interface TeamMember { id: string; full_name: string | null; email: string | null; }
interface RouteRun { id: string; name: string; route_date: string; status: string; driver_id: string | null; stops: unknown; total_stops: number; completed_stops: number; map_url: string | null; notes: string | null; created_at: string; }
interface OperationsException { id: string; entity_type: string; entity_id: string | null; order_id: string | null; category: string; severity: Severity; status: ExceptionStatus; title: string; description: string | null; assigned_to: string | null; due_at: string | null; resolution: string | null; created_at: string; }
interface TimelineEvent { id: string; entity_type: string; entity_id: string; event_type: string; title: string; description: string | null; actor_id: string | null; occurred_at: string; }
interface ActivityEvent { id: string; order_id: string; activity_type: string; title: string; description: string | null; user_id: string | null; created_at: string; }
interface ActionItem { id: string; title: string; priority: string; status: string; assigned_to: string | null; due_at: string | null; workspace: string; }
interface SavedView { id: string; name: string; configuration: unknown; is_default: boolean; }
interface OrderItemRow { id: string; order_id: string; name: string; code: string | null; quantity: number; qty_on_po: number; qty_received: number; qty_invoiced: number; qty_completed: number; }
interface AllocationRow { order_item_id: string; quantity_ordered: number; quantity_received: number; }
interface OrderRef { id: string; order_number: string; }
interface ReconciliationIssue { id: string; orderId: string; orderNumber: string; itemName: string; code: string | null; kind: string; detail: string; severity: Severity; }
interface SavedConfiguration { tab?: TowerTab; status?: string; severity?: string; search?: string; }

const TABS: { id: TowerTab; label: string; icon: typeof Radar }[] = [
  { id: "overview", label: "Today", icon: Gauge },
  { id: "routes", label: "Routes", icon: Route },
  { id: "exceptions", label: "Exceptions", icon: ShieldAlert },
  { id: "activity", label: "Activity", icon: Activity },
];
const SEVERITY_STYLE: Record<Severity, string> = { critical: "border-destructive/30 bg-destructive/10 text-destructive", high: "border-orange-500/30 bg-orange-500/10 text-orange-600", medium: "border-amber-500/30 bg-amber-500/10 text-amber-600", low: "border-border bg-muted text-muted-foreground" };
const CATEGORIES: Record<string, string> = { short_delivery: "Short delivery", damaged_stock: "Damaged stock", wrong_item: "Wrong item", customer_unavailable: "Customer unavailable", delivery_refused: "Delivery refused", missing_document: "Missing document", quantity_mismatch: "Quantity mismatch", supplier_delay: "Supplier delay", other: "Other" };

export default function OperationsControlTower() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState<TowerTab>("overview");
  const [routes, setRoutes] = useState<RouteRun[]>([]);
  const [exceptions, setExceptions] = useState<OperationsException[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [orderActivity, setOrderActivity] = useState<ActivityEvent[]>([]);
  const [tasks, setTasks] = useState<ActionItem[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [issues, setIssues] = useState<ReconciliationIssue[]>([]);
  const [readyDeliveryCount, setReadyDeliveryCount] = useState(0);
  const [readyCollectionCount, setReadyCollectionCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [offlineCount, setOfflineCount] = useState(pendingOfflineOperationCount());
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [composerOpen, setComposerOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("other");
  const [severity, setSeverity] = useState<Severity>("medium");
  const [entityType, setEntityType] = useState("general");
  const [entityId, setEntityId] = useState("");
  const [assignee, setAssignee] = useState("unassigned");
  const [dueAt, setDueAt] = useState("");
  const [savingException, setSavingException] = useState(false);
  const [savedViewName, setSavedViewName] = useState("");

  const memberName = useCallback((id: string | null | undefined) => {
    if (!id) return "Unassigned";
    const member = members.find((candidate) => candidate.id === id);
    return member?.full_name || member?.email || "Team member";
  }, [members]);

  const fetchData = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true); else setLoading(true);
    const result = await Promise.all([
      supabase.from("dispatch_routes").select("*").order("route_date", { ascending: false }).limit(60),
      supabase.from("operations_exceptions").select("*").order("created_at", { ascending: false }).limit(150),
      supabase.from("fulfillment_timeline_events").select("id,entity_type,entity_id,event_type,title,description,actor_id,occurred_at").order("occurred_at", { ascending: false }).limit(180),
      supabase.from("order_activity_log").select("id,order_id,activity_type,title,description,user_id,created_at").order("created_at", { ascending: false }).limit(120),
      supabase.from("team_action_items").select("id,title,priority,status,assigned_to,due_at,workspace").neq("status", "done").order("created_at", { ascending: false }).limit(80),
      supabase.from("profiles").select("id,full_name,email").eq("approved", true).order("full_name"),
      supabase.from("orders").select("id,status,completed_date,fulfillment_method,fulfillment_status").is("completed_date", null).limit(5000),
      supabase.from("po_tracking_cache").select("payload").eq("id", "00000000-0000-0000-0000-000000000003").maybeSingle(),
      supabase.from("po_collection_state").select("purchase_order_id,status,completed_at"),
    ]);
    const [routeRes, exceptionRes, timelineRes, activityRes, taskRes, memberRes, activeOrderRes, poCacheRes, poStateRes] = result;
    const firstError = result.find((entry) => entry.error)?.error;
    if (firstError) toast({ title: "Some dispatch data could not load", description: firstError.message, variant: "destructive" });

    setRoutes((routeRes.data || []) as RouteRun[]);
    setExceptions((exceptionRes.data || []) as OperationsException[]);
    setTimeline((timelineRes.data || []) as TimelineEvent[]);
    setOrderActivity((activityRes.data || []) as ActivityEvent[]);
    setTasks((taskRes.data || []) as ActionItem[]);
    setMembers((memberRes.data || []) as TeamMember[]);
    setIssues([]);

    const activeOrders = (activeOrderRes.data || []).filter((order: any) =>
      String(order.status || "").toLowerCase() !== "delivered" &&
      !order.completed_date &&
      order.fulfillment_method !== "collection" &&
      order.fulfillment_status !== "completed"
    );
    if (activeOrders.length) {
      const itemRes = await supabase.from("order_items").select("order_id,quantity,qty_invoiced,qty_completed").in("order_id", activeOrders.map((order: any) => order.id));
      const readyIds = new Set<string>();
      (itemRes.data || []).forEach((item: any) => {
        const quantity = Number(item.quantity || 0);
        const ready = Math.max(0, Math.min(Number(item.qty_invoiced || 0), quantity) - Math.min(Number(item.qty_completed || 0), quantity));
        if (ready > 0) readyIds.add(item.order_id);
      });
      setReadyDeliveryCount(readyIds.size);
    } else setReadyDeliveryCount(0);

    const completedPOs = new Set((poStateRes.data || []).filter((row: any) => row.status === "collected" || row.completed_at).map((row: any) => row.purchase_order_id));
    const poPayload = Array.isArray(poCacheRes.data?.payload) ? poCacheRes.data.payload as any[] : [];
    const closedStatus = new Set(["cancelled","closed","rejected","draft","void","billed"]);
    const closedBilled = new Set(["billed","fully_billed"]);
    const closedReceived = new Set(["received","fully_received"]);
    const activePOs = poPayload.filter((po: any) => {
      if (!po?.purchaseOrderId || completedPOs.has(po.purchaseOrderId)) return false;
      if (closedStatus.has(String(po.status || "").toLowerCase())) return false;
      if (closedBilled.has(String(po.billedStatus || "").toLowerCase())) return false;
      if (closedReceived.has(String(po.receivedStatus || "").toLowerCase())) return false;
      return Array.isArray(po.lines) && po.lines.some((line: any) => Number(line.outstanding || 0) > 0);
    });
    setReadyCollectionCount(activePOs.length);
    setLoading(false); setRefreshing(false);
  }, [toast]);

  useEffect(() => { void fetchData(); return subscribeOfflineQueue(() => setOfflineCount(pendingOfflineOperationCount())); }, [fetchData]);
  useLiveData(["dispatch_routes", "operations_exceptions", "fulfillment_timeline_events", "order_activity_log", "team_action_items", "order_items", "order_item_po_allocations", "operational_saved_views"], () => void fetchData(true), { channelName: "operations-command-centre" });

  const activeRoutes = useMemo(() => {
    const yesterday = new Date(); yesterday.setHours(0,0,0,0); yesterday.setDate(yesterday.getDate() - 1);
    return routes.filter((route) => {
      if (["completed", "cancelled"].includes(route.status)) return false;
      if (route.status === "in_progress") return true;
      const routeDate = new Date(`${route.route_date}T12:00:00`);
      return !Number.isNaN(routeDate.getTime()) && routeDate >= yesterday;
    });
  }, [routes]);
  const openExceptions = useMemo(() => exceptions.filter((item) => item.status !== "resolved"), [exceptions]);
  const filteredExceptions = useMemo(() => openExceptions.filter((item) => (severityFilter === "all" || item.severity === severityFilter) && `${item.title} ${item.description || ""} ${item.entity_id || ""}`.toLowerCase().includes(search.toLowerCase())), [openExceptions, search, severityFilter]);
  const filteredIssues = useMemo(() => issues.filter((item) => `${item.orderNumber} ${item.itemName} ${item.code || ""} ${item.kind}`.toLowerCase().includes(search.toLowerCase())), [issues, search]);
  const mine = useMemo(() => tasks.filter((item) => item.assigned_to === user?.id).length + openExceptions.filter((item) => item.assigned_to === user?.id).length, [tasks, openExceptions, user?.id]);
  const score = Math.max(0, Math.round(100 - Math.min(55, openExceptions.length * 4) - Math.min(30, issues.length * 1.5) - Math.min(15, offlineCount * 2)));
  const mergedActivity = useMemo(() => [...timeline.map((event) => ({ id: `t-${event.id}`, title: event.title, description: event.description, actor: event.actor_id, at: event.occurred_at, type: event.entity_type, entityId: event.entity_id })), ...orderActivity.map((event) => ({ id: `a-${event.id}`, title: event.title, description: event.description, actor: event.user_id, at: event.created_at, type: "order", entityId: event.order_id }))].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 250), [timeline, orderActivity]);

  const createException = async () => {
    if (!user || title.trim().length < 3) { toast({ title: "Add a clear exception title", variant: "destructive" }); return; }
    setSavingException(true);
    const { error } = await supabase.from("operations_exceptions").insert({ title: title.trim(), description: description.trim() || null, category, severity, entity_type: entityType, entity_id: entityId.trim() || null, assigned_to: assignee === "unassigned" ? null : assignee, due_at: dueAt ? new Date(dueAt).toISOString() : null, created_by: user.id } as any);
    setSavingException(false);
    if (error) { toast({ title: "Exception could not be raised", description: error.message, variant: "destructive" }); return; }
    setTitle(""); setDescription(""); setEntityId(""); setDueAt(""); setComposerOpen(false); toast({ title: "Exception is now live" }); void fetchData(true);
  };
  const updateException = async (item: OperationsException, patch: Partial<OperationsException>) => { setExceptions((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, ...patch } : candidate)); const { error } = await supabase.from("operations_exceptions").update(patch as any).eq("id", item.id); if (error) { toast({ title: "Exception update failed", description: error.message, variant: "destructive" }); void fetchData(true); } };
  const updateRoute = async (route: RouteRun, status: string) => { setRoutes((current) => current.map((candidate) => candidate.id === route.id ? { ...candidate, status } : candidate)); const { error } = await supabase.from("dispatch_routes").update({ status }).eq("id", route.id); if (error) { toast({ title: "Route update failed", description: error.message, variant: "destructive" }); void fetchData(true); } };
  const raiseIssue = async (issue: ReconciliationIssue) => { if (!user) return; if (exceptions.some((item) => item.status !== "resolved" && item.entity_id === issue.id && item.category === "quantity_mismatch")) { toast({ title: "This mismatch is already being tracked" }); return; } const { error } = await supabase.from("operations_exceptions").insert({ entity_type: "order", entity_id: issue.id, order_id: issue.orderId, category: "quantity_mismatch", severity: issue.severity, title: `${issue.orderNumber}: ${issue.kind}`, description: `${issue.itemName} — ${issue.detail}`, created_by: user.id } as any); if (error) toast({ title: "Could not create exception", description: error.message, variant: "destructive" }); else toast({ title: "Mismatch added to the exception queue" }); };
  const saveView = async () => { if (!user || savedViewName.trim().length < 2) return; const configuration: SavedConfiguration = { tab, status: statusFilter, severity: severityFilter, search }; const { error } = await supabase.from("operational_saved_views").upsert({ user_id: user.id, workspace: "control-tower", name: savedViewName.trim(), configuration: configuration as any }, { onConflict: "user_id,workspace,name" }); if (error) toast({ title: "View could not be saved", description: error.message, variant: "destructive" }); else { setSavedViewName(""); toast({ title: "Personal view saved" }); void fetchData(true); } };
  const applyView = (view: SavedView) => { const config = (view.configuration || {}) as SavedConfiguration; if (config.tab) setTab(config.tab); setStatusFilter(config.status || "active"); setSeverityFilter(config.severity || "all"); setSearch(config.search || ""); };
  const deleteView = async (id: string) => { await supabase.from("operational_saved_views").delete().eq("id", id); void fetchData(true); };
  const openWorkspace = (view: string) => window.dispatchEvent(new CustomEvent("setActiveView", { detail: view }));
  const openDispatchPlanner = () => {
    window.sessionStorage.setItem("aleph:open-dispatch-planner", "1");
    openWorkspace("fulfillment");
    window.setTimeout(() => window.dispatchEvent(new CustomEvent("aleph:open-dispatch-planner")), 120);
  };

  return (
    <div className="space-y-4 pb-8">
      <section className="overflow-hidden rounded-[28px] border border-border/60 bg-card shadow-sm">
        <div className="h-1.5 w-full bg-gradient-to-r from-[hsl(var(--ribbon-1))] via-[hsl(var(--ribbon-3))] to-[hsl(var(--ribbon-5))]" />
        <div className="flex flex-col gap-4 p-5 sm:p-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className="rounded-full border-primary/20 bg-primary/5 text-primary"><Radar className="mr-1 h-3 w-3" />Dispatch Control</Badge>{offlineCount > 0 && <Badge variant="outline" className="rounded-full border-amber-500/25 bg-amber-500/10 text-amber-700"><CloudOff className="mr-1 h-3 w-3" />{offlineCount} queued</Badge>}</div><h1 className="mt-3 text-3xl font-black tracking-tight">Today’s dispatch picture</h1><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Only current deliveries, collections, routes and blockers. Completed and stale work stays out of the way.</p></div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:min-w-[460px]">{[[readyDeliveryCount,"Ready deliveries"],[readyCollectionCount,"Ready collections"],[activeRoutes.length,"Active routes"],[openExceptions.length,"Blockers"]].map(([value,label]) => <div key={String(label)} className="rounded-2xl border border-border/55 bg-muted/25 p-3"><p className="text-2xl font-black">{value}</p><p className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p></div>)}</div>
        </div>
        <div className="flex flex-col gap-3 border-t border-border/50 bg-muted/20 p-3 xl:flex-row xl:items-center"><div className="grid flex-1 grid-cols-4 gap-1 rounded-2xl bg-muted/55 p-1">{TABS.map((item) => <button key={item.id} onClick={() => setTab(item.id)} className={cn("flex min-w-0 items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-[10px] font-black transition-all sm:text-xs", tab === item.id ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground")}><item.icon className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{item.label}</span></button>)}</div><Button variant="outline" size="icon" className="h-10 w-10 rounded-xl" onClick={() => void fetchData(true)} disabled={refreshing} title="Refresh"><RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} /></Button></div>
      </section>

      {tab === "exceptions" && <section className="flex flex-col gap-2 rounded-[22px] border border-border/60 bg-card/85 p-3 shadow-sm lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} className="h-10 rounded-xl bg-muted/30 pl-9" placeholder="Search exceptions…" /></div>
        <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="h-10 rounded-xl lg:w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="all">All</SelectItem><SelectItem value="open">Open</SelectItem><SelectItem value="investigating">Investigating</SelectItem><SelectItem value="blocked">Blocked</SelectItem></SelectContent></Select>
        <Select value={severityFilter} onValueChange={setSeverityFilter}><SelectTrigger className="h-10 rounded-xl lg:w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All severity</SelectItem>{(["critical", "high", "medium", "low"] as Severity[]).map((item) => <SelectItem key={item} value={item} className="capitalize">{item}</SelectItem>)}</SelectContent></Select>
      </section>}

      {loading ? <div className="grid min-h-[420px] place-items-center rounded-[28px] bg-muted/25"><div className="text-center"><Loader2 className="mx-auto h-7 w-7 animate-spin text-primary" /><p className="mt-3 text-xs font-bold text-muted-foreground">Reconciling live operations…</p></div></div> : tab === "overview" ? <OverviewPanel readyDeliveries={readyDeliveryCount} readyCollections={readyCollectionCount} routes={activeRoutes} exceptions={openExceptions} tasks={tasks} memberName={memberName} onTab={setTab} onOpenWorkspace={openWorkspace} /> : tab === "routes" ? <RoutesPanel routes={activeRoutes} memberName={memberName} onUpdate={updateRoute} onPlan={openDispatchPlanner} /> : tab === "team" ? <TeamPanel members={members} routes={activeRoutes} tasks={tasks} exceptions={openExceptions} memberName={memberName} /> : tab === "map" ? <MapPanel routes={activeRoutes} /> : tab === "exceptions" ? <ExceptionsPanel items={filteredExceptions} members={members} memberName={memberName} composerOpen={composerOpen} setComposerOpen={setComposerOpen} form={{ title, description, category, severity, entityType, entityId, assignee, dueAt }} setters={{ setTitle, setDescription, setCategory, setSeverity, setEntityType, setEntityId, setAssignee, setDueAt }} saving={savingException} onCreate={createException} onUpdate={updateException} /> : tab === "reconciliation" ? <ReconciliationPanel issues={filteredIssues} onRaise={raiseIssue} onOpenOrder={() => openWorkspace("orders")} /> : <ActivityPanel events={mergedActivity} memberName={memberName} />}

    </div>
  );
}

function OverviewPanel({ readyDeliveries, readyCollections, routes, exceptions, tasks, memberName, onTab, onOpenWorkspace }: { readyDeliveries: number; readyCollections: number; routes: RouteRun[]; exceptions: OperationsException[]; tasks: ActionItem[]; memberName: (id: string | null) => string; onTab: (tab: TowerTab) => void; onOpenWorkspace: (view: string) => void; }) {
  const lanes = [
    { title: "Deliveries ready", value: readyDeliveries, detail: "Customer work waiting for dispatch", icon: Truck, tone: "bg-cyan-500/12 text-cyan-600", action: () => onOpenWorkspace("fulfillment") },
    { title: "Collections ready", value: readyCollections, detail: "Supplier pickups still outstanding", icon: Package, tone: "bg-violet-500/12 text-violet-600", action: () => onOpenWorkspace("fulfillment") },
    { title: "Routes moving", value: routes.length, detail: `${routes.reduce((sum, route) => sum + Math.max(0, route.total_stops - route.completed_stops), 0)} stops remaining`, icon: Route, tone: "bg-primary/10 text-primary", action: () => onTab("routes") },
  ];
  return <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(300px,.75fr)]"><div className="space-y-4"><div className="grid gap-3 sm:grid-cols-3">{lanes.map((lane) => <button key={lane.title} onClick={lane.action} className="group rounded-[22px] border border-border/60 bg-card p-4 text-left shadow-sm transition hover:border-primary/25 hover:bg-muted/15"><span className={cn("grid h-10 w-10 place-items-center rounded-2xl", lane.tone)}><lane.icon className="h-4 w-4" /></span><p className="mt-3 text-3xl font-black">{lane.value}</p><p className="text-xs font-black">{lane.title}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{lane.detail}</p></button>)}</div><Card className="overflow-hidden rounded-[24px] border-border/60"><PanelTitle title="Blockers" body="Only unresolved dispatch problems." icon={ShieldAlert} /><div className="divide-y divide-border/50">{exceptions.slice(0,5).map((item)=><button key={item.id} onClick={()=>onTab("exceptions")} className="flex w-full items-center gap-3 p-3.5 text-left hover:bg-muted/35"><span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", item.severity === "critical" ? "bg-destructive/10 text-destructive" : "bg-amber-500/10 text-amber-600")}><CircleAlert className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-black">{item.title}</span><span className="block truncate text-[10px] text-muted-foreground">{memberName(item.assigned_to)} · {item.status}</span></span><Badge variant="outline" className={cn("capitalize",SEVERITY_STYLE[item.severity])}>{item.severity}</Badge></button>)}{!exceptions.length && <Empty icon={CheckCircle2} title="No dispatch blockers" body="Current dispatch work is clear." />}</div></Card></div><Card className="overflow-hidden rounded-[24px] border-border/60"><PanelTitle title="My team queue" body="Assigned work that is still open." icon={Users} /><div className="divide-y divide-border/50">{tasks.slice(0,8).map((task)=><button key={task.id} onClick={()=>onOpenWorkspace(task.workspace)} className="flex w-full items-center gap-3 p-3.5 text-left hover:bg-muted/35"><span className={cn("h-2 w-2 shrink-0 rounded-full", task.priority === "critical" ? "bg-destructive" : task.priority === "high" ? "bg-orange-500" : "bg-primary/60")} /><span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold">{task.title}</span><span className="block text-[10px] text-muted-foreground">{memberName(task.assigned_to)}</span></span><ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/40" /></button>)}{!tasks.length && <Empty icon={ListChecks} title="Queue is clear" body="No open team action items." />}</div></Card></div>;
}

function RoutesPanel({ routes, memberName, onUpdate, onPlan }: { routes: RouteRun[]; memberName: (id: string | null) => string; onUpdate: (route: RouteRun, status: string) => void; onPlan: () => void; }) {
  return <div className="space-y-4"><div className="flex flex-col gap-3 rounded-[24px] border border-border/60 bg-card p-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-black">Dispatch runs</h2><p className="text-xs text-muted-foreground">One live route can now contain both customer deliveries and supplier collections, grouped by learned dispatch area.</p></div><Button className="rounded-xl" onClick={onPlan}><Plus className="mr-1.5 h-4 w-4" />Plan dispatch run</Button></div><div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">{routes.map((route) => { const stops = Array.isArray(route.stops) ? route.stops : []; const deliveries = stops.filter((stop: any) => (stop.stopType || "delivery") === "delivery").length; const collections = stops.filter((stop: any) => stop.stopType === "collection").length; return <Card key={route.id} className="overflow-hidden rounded-[26px] border-border/60"><div className="border-b border-border/50 bg-gradient-to-br from-primary/[0.09] to-cyan-500/[0.07] p-4"><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-1.5"><Badge variant="outline" className="rounded-full capitalize">{route.status.replace("_", " ")}</Badge>{deliveries > 0 && <Badge variant="outline" className="rounded-full border-cyan-500/25 bg-cyan-500/10 text-cyan-700">{deliveries} delivery</Badge>}{collections > 0 && <Badge variant="outline" className="rounded-full border-violet-500/25 bg-violet-500/10 text-violet-700">{collections} collection</Badge>}</div><h3 className="mt-3 text-lg font-black">{route.name}</h3><p className="mt-1 text-xs text-muted-foreground">{new Date(`${route.route_date}T12:00:00`).toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" })} · {memberName(route.driver_id)}</p></div><span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary text-primary-foreground"><MapPinned className="h-5 w-5" /></span></div></div><div className="p-4"><div className="grid grid-cols-2 gap-2"><Metric value={route.total_stops} label="stops" /><Metric value={route.completed_stops} label="completed" /></div><div className="mt-3 space-y-1.5">{stops.slice(0, 4).map((stop: any, index) => <div key={`${route.id}-${index}`} className="flex items-center gap-2 rounded-xl bg-muted/35 px-3 py-2 text-[10px]"><span className="font-black text-primary">{index + 1}</span><Badge variant="outline" className={cn("h-5 px-1.5 text-[8px] font-black uppercase", stop.stopType === "collection" ? "border-violet-500/25 text-violet-700" : "border-cyan-500/25 text-cyan-700")}>{stop.stopType === "collection" ? "Collection" : "Delivery"}</Badge><span className="min-w-0 flex-1 truncate font-semibold">{stop.label || stop.client || stop.companyName || stop.reference || stop.orderNumber || "Stop"}</span>{stop.areaName && <span className="shrink-0 text-muted-foreground">{stop.areaName}</span>}</div>)}{stops.length > 4 && <p className="px-2 text-[10px] text-muted-foreground">+ {stops.length - 4} more stops</p>}</div><div className="mt-4 flex gap-2"><Select value={route.status} onValueChange={(value) => onUpdate(route, value)}><SelectTrigger className="h-9 flex-1 rounded-xl"><SelectValue /></SelectTrigger><SelectContent>{["draft", "ready", "in_progress", "completed", "cancelled"].map((status) => <SelectItem key={status} value={status} className="capitalize">{status.replace("_", " ")}</SelectItem>)}</SelectContent></Select>{route.map_url && <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl" onClick={() => window.open(route.map_url!, "_blank", "noopener,noreferrer")}><ArrowUpRight className="h-4 w-4" /></Button>}</div></div></Card>; })}</div>{!routes.length && <Empty icon={Route} title="No dispatch routes yet" body="Choose Plan dispatch run, then select any mixture of deliveries and collections." />}</div>;
}

function ExceptionsPanel({ items, members, memberName, composerOpen, setComposerOpen, form, setters, saving, onCreate, onUpdate }: any) {
  return <div className="space-y-4">{composerOpen ? <Card className="space-y-3 rounded-[26px] border-2 border-primary/20 p-4 shadow-lg"><div className="flex items-center justify-between"><div><h2 className="font-black">Raise an operational exception</h2><p className="text-xs text-muted-foreground">Give it an owner and keep its resolution visible.</p></div><Button variant="ghost" size="icon" onClick={() => setComposerOpen(false)}><X className="h-4 w-4" /></Button></div><Input autoFocus value={form.title} onChange={(event) => setters.setTitle(event.target.value)} placeholder="What went wrong?" className="rounded-xl" /><Textarea value={form.description} onChange={(event) => setters.setDescription(event.target.value)} placeholder="Facts, impact and the next useful action…" className="min-h-20 resize-none rounded-xl" /><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5"><Select value={form.category} onValueChange={setters.setCategory}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(CATEGORIES).map(([id, label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}</SelectContent></Select><Select value={form.severity} onValueChange={setters.setSeverity}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent>{["critical", "high", "medium", "low"].map((value) => <SelectItem key={value} value={value} className="capitalize">{value}</SelectItem>)}</SelectContent></Select><Select value={form.entityType} onValueChange={setters.setEntityType}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent>{["general", "order", "purchase_order", "delivery", "collection", "route"].map((value) => <SelectItem key={value} value={value} className="capitalize">{value.replace("_", " ")}</SelectItem>)}</SelectContent></Select><Input value={form.entityId} onChange={(event) => setters.setEntityId(event.target.value)} placeholder="Order / PO / route ID" className="rounded-xl" /><Select value={form.assignee} onValueChange={setters.setAssignee}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unassigned">Unassigned</SelectItem>{members.map((member: TeamMember) => <SelectItem key={member.id} value={member.id}>{member.full_name || member.email}</SelectItem>)}</SelectContent></Select></div><div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><Input type="datetime-local" value={form.dueAt} onChange={(event) => setters.setDueAt(event.target.value)} className="rounded-xl sm:w-60" /><Button className="rounded-xl" disabled={saving} onClick={() => void onCreate()}>{saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ShieldAlert className="mr-1.5 h-4 w-4" />}Raise exception</Button></div></Card> : <div className="flex justify-end"><Button className="rounded-xl" onClick={() => setComposerOpen(true)}><Plus className="mr-1.5 h-4 w-4" />Raise exception</Button></div>}
    <div className="grid gap-3 xl:grid-cols-2">{items.map((item: OperationsException) => <Card key={item.id} className={cn("rounded-[24px] border-l-4 p-4", item.severity === "critical" ? "border-l-destructive" : item.severity === "high" ? "border-l-orange-500" : "border-l-amber-400")}><div className="flex items-start gap-3"><span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-2xl", SEVERITY_STYLE[item.severity])}><AlertTriangle className="h-4 w-4" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-1.5"><Badge variant="outline" className={cn("capitalize", SEVERITY_STYLE[item.severity])}>{item.severity}</Badge><Badge variant="secondary">{CATEGORIES[item.category] || item.category}</Badge>{item.entity_id && <Badge variant="outline">{item.entity_id}</Badge>}</div><h3 className="mt-2 font-black">{item.title}</h3>{item.description && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.description}</p>}<p className="mt-2 text-[10px] font-semibold text-muted-foreground">{memberName(item.assigned_to)} · raised {formatWhen(item.created_at)}</p></div></div><div className="mt-4 grid gap-2 sm:grid-cols-2"><Select value={item.status} onValueChange={(value) => onUpdate(item, { status: value, resolved_at: value === "resolved" ? new Date().toISOString() : null })}><SelectTrigger className="h-9 rounded-xl"><SelectValue /></SelectTrigger><SelectContent>{["open", "investigating", "blocked", "resolved"].map((value) => <SelectItem key={value} value={value} className="capitalize">{value}</SelectItem>)}</SelectContent></Select><Select value={item.assigned_to || "unassigned"} onValueChange={(value) => onUpdate(item, { assigned_to: value === "unassigned" ? null : value })}><SelectTrigger className="h-9 rounded-xl"><UserRound className="mr-2 h-3.5 w-3.5" /><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unassigned">Unassigned</SelectItem>{members.map((member: TeamMember) => <SelectItem key={member.id} value={member.id}>{member.full_name || member.email}</SelectItem>)}</SelectContent></Select></div></Card>)}</div>{!items.length && <Empty icon={CheckCircle2} title="Nothing matches this exception view" body="Change the filters or raise a new exception." />}</div>;
}

function ReconciliationPanel({ issues, onRaise, onOpenOrder }: { issues: ReconciliationIssue[]; onRaise: (issue: ReconciliationIssue) => void; onOpenOrder: () => void; }) {
  return <div className="space-y-4"><div className="rounded-[24px] border border-violet-500/20 bg-violet-500/[0.06] p-4"><div className="flex items-start gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-violet-500/15 text-violet-600"><Wrench className="h-5 w-5" /></span><div><h2 className="font-black">Automatic quantity reconciliation</h2><p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">Ordered quantities, linked PO allocations, receipts, invoices and completed handovers are compared continuously. Turn any mismatch into an owned exception with one click.</p></div></div></div><div className="grid gap-3 xl:grid-cols-2">{issues.map((issue) => <Card key={issue.id} className="rounded-[24px] border-border/60 p-4"><div className="flex items-start gap-3"><span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-2xl", SEVERITY_STYLE[issue.severity])}><CircleAlert className="h-4 w-4" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-black text-primary">{issue.orderNumber}</h3><Badge variant="outline" className={SEVERITY_STYLE[issue.severity]}>{issue.kind}</Badge></div><p className="mt-1 truncate text-xs font-bold">{issue.itemName}</p>{issue.code && <p className="font-mono text-[10px] text-muted-foreground">{issue.code}</p>}<p className="mt-2 text-xs text-muted-foreground">{issue.detail}</p></div></div><div className="mt-4 flex gap-2"><Button variant="outline" size="sm" className="rounded-xl" onClick={onOpenOrder}>Open orders</Button><Button size="sm" className="flex-1 rounded-xl" onClick={() => void onRaise(issue)}><ShieldAlert className="mr-1.5 h-3.5 w-3.5" />Track as exception</Button></div></Card>)}</div>{!issues.length && <Empty icon={CheckCircle2} title="Quantities reconcile cleanly" body="No material PO, receipt, invoice or completion mismatches were detected." />}</div>;
}

function ActivityPanel({ events, memberName }: { events: { id: string; title: string; description: string | null; actor: string | null; at: string; type: string; entityId: string }[]; memberName: (id: string | null) => string; }) {
  return <Card className="overflow-hidden rounded-[28px] border-border/60"><PanelTitle title="Operations activity stream" body="Orders, delivery movement, collection work, exceptions and routes in one audit trail." icon={Activity} /><div className="max-h-[680px] overflow-y-auto p-3"><div className="relative space-y-1 before:absolute before:bottom-5 before:left-[19px] before:top-5 before:w-px before:bg-border">{events.map((event) => <div key={event.id} className="relative grid grid-cols-[40px_minmax(0,1fr)_auto] gap-3 rounded-2xl p-2.5 hover:bg-muted/35"><span className="z-10 grid h-10 w-10 place-items-center rounded-2xl border border-border/60 bg-background text-primary">{event.type === "route" ? <Route className="h-4 w-4" /> : event.type === "exception" ? <ShieldAlert className="h-4 w-4" /> : <Activity className="h-4 w-4" />}</span><div className="min-w-0"><p className="text-xs font-black">{event.title}</p>{event.description && <p className="mt-0.5 text-[10px] text-muted-foreground">{event.description}</p>}<p className="mt-1 text-[9px] font-semibold text-muted-foreground">{memberName(event.actor)} · {event.type.replace("_", " ")} {event.entityId}</p></div><span className="whitespace-nowrap pt-1 text-[9px] font-bold text-muted-foreground">{formatWhen(event.at)}</span></div>)}</div>{!events.length && <Empty icon={Activity} title="No activity yet" body="Live operational changes will appear here." />}</div></Card>;
}

function PanelTitle({ title, body, icon: Icon }: { title: string; body: string; icon: typeof Radar }) { return <div className="flex items-center justify-between border-b border-border/55 p-4"><div><h2 className="text-sm font-black">{title}</h2><p className="text-[10px] text-muted-foreground">{body}</p></div><Icon className="h-4 w-4 text-primary" /></div>; }
function Metric({ value, label }: { value: number; label: string }) { return <div className="rounded-2xl bg-muted/35 p-3"><p className="text-2xl font-black">{value}</p><p className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">{label}</p></div>; }
function Empty({ icon: Icon, title, body }: { icon: typeof Radar; title: string; body: string }) { return <div className="grid min-h-48 place-items-center rounded-[24px] border border-dashed border-border/60 bg-muted/20 p-6 text-center"><div><Icon className="mx-auto h-8 w-8 text-emerald-500/60" /><p className="mt-3 text-sm font-black">{title}</p><p className="mt-1 text-xs text-muted-foreground">{body}</p></div></div>; }


function TeamPanel({ members, routes, tasks, exceptions, memberName }: { members: TeamMember[]; routes: RouteRun[]; tasks: ActionItem[]; exceptions: OperationsException[]; memberName: (id: string | null | undefined) => string }) {
  const rows = members.map(member => ({ member, routes: routes.filter(r => r.driver_id === member.id).length, tasks: tasks.filter(t => t.assigned_to === member.id).length, exceptions: exceptions.filter(e => e.assigned_to === member.id).length })).sort((a,b)=>(b.routes+b.tasks+b.exceptions)-(a.routes+a.tasks+a.exceptions));
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{rows.map(({member,routes,tasks,exceptions}) => <Card key={member.id} className="border-border/55"><div className="p-4"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-2xl bg-primary/10 font-black text-primary">{(member.full_name||member.email||"?").charAt(0).toUpperCase()}</span><div className="min-w-0"><p className="truncate font-black">{memberName(member.id)}</p><p className="text-[10px] text-muted-foreground">Current operational load</p></div></div><div className="mt-4 grid grid-cols-3 gap-2 text-center">{[["Routes",routes],["Tasks",tasks],["Issues",exceptions]].map(([label,value])=><div key={String(label)} className="rounded-xl bg-muted/30 p-2"><p className="text-lg font-black">{value}</p><p className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</p></div>)}</div></div></Card>)}</div>;
}
function MapPanel({ routes }: { routes: RouteRun[] }) {
  const groups = new Map<string, any[]>();
  routes.forEach(route => (Array.isArray(route.stops) ? route.stops : []).forEach((stop:any) => { const area = stop.areaName || stop.area_name || "Unlinked area"; const existing=groups.get(area)||[]; existing.push({...stop, routeName:route.name}); groups.set(area,existing); }));
  return <div className="space-y-4"><Card className="border-primary/15 bg-gradient-to-br from-card to-primary/[.04]"><div className="p-5"><div className="flex items-center gap-2"><MapPinned className="h-5 w-5 text-primary"/><h2 className="font-black">Live dispatch map board</h2></div><p className="mt-1 text-xs text-muted-foreground">Area clusters learned by your dispatch planner. Open the saved route for turn-by-turn navigation.</p></div></Card><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{Array.from(groups.entries()).map(([area,stops])=><Card key={area} className="border-border/55"><div className="p-4"><div className="flex items-center justify-between"><h3 className="font-black">{area}</h3><Badge variant="secondary">{stops.length} stops</Badge></div><div className="mt-3 space-y-2">{stops.slice(0,6).map((stop:any,index:number)=><div key={index} className="rounded-xl bg-muted/30 p-2.5"><div className="flex items-center gap-2"><Badge variant="outline" className="text-[8px] uppercase">{stop.type||"stop"}</Badge><span className="truncate text-xs font-bold">{stop.reference||stop.label||"Stop"}</span></div><p className="mt-1 truncate text-[10px] text-muted-foreground">{stop.address||stop.routeName}</p></div>)}</div></div></Card>)}</div></div>;
}

function buildReconciliationIssues(items: OrderItemRow[], allocations: AllocationRow[], orders: OrderRef[]): ReconciliationIssue[] {
  const orderNumbers = new Map(orders.map((order) => [order.id, order.order_number]));
  const totals = new Map<string, { ordered: number; received: number }>();
  allocations.forEach((row) => { const current = totals.get(row.order_item_id) || { ordered: 0, received: 0 }; current.ordered += Number(row.quantity_ordered) || 0; current.received += Number(row.quantity_received) || 0; totals.set(row.order_item_id, current); });
  const result: ReconciliationIssue[] = [];
  items.forEach((item) => {
    const quantity = Number(item.quantity) || 0, onPO = Number(item.qty_on_po) || 0, received = Number(item.qty_received) || 0, invoiced = Number(item.qty_invoiced) || 0, completed = Number(item.qty_completed) || 0, allocation = totals.get(item.id);
    const base = { orderId: item.order_id, orderNumber: orderNumbers.get(item.order_id) || "Order", itemName: item.name, code: item.code };
    if (allocation && Math.abs(onPO - allocation.ordered) > .001) result.push({ ...base, id: `${item.id}:po`, kind: "PO mismatch", detail: `Item ledger says ${onPO} on PO, but linked PO allocations total ${allocation.ordered}.`, severity: "high" });
    if (allocation && Math.abs(received - allocation.received) > .001) result.push({ ...base, id: `${item.id}:received`, kind: "Receipt mismatch", detail: `Item ledger says ${received} received, but linked PO receipts total ${allocation.received}.`, severity: "high" });
    if (onPO > quantity + .001 || received > onPO + .001 || invoiced > received + .001 || completed > invoiced + .001) result.push({ ...base, id: `${item.id}:flow`, kind: "Flow mismatch", detail: `Ordered ${quantity} → PO ${onPO} → received ${received} → invoiced ${invoiced} → completed ${completed}.`, severity: completed > invoiced || invoiced > received ? "critical" : "medium" });
  });
  return result.slice(0, 500);
}
function formatWhen(value: string) { const date = new Date(value), diff = Date.now() - date.getTime(); if (diff < 60000) return "just now"; if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`; if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`; return date.toLocaleDateString("en-ZA", { day: "numeric", month: "short" }); }
