import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, Navigation, Route } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLiveData } from "@/hooks/useLiveData";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface MyWorkPageProps { onNavigate: (view: string) => void; }
export default function MyWorkPage({ onNavigate }: MyWorkPageProps) {
  const { user } = useAuth();
  const [deliveries,setDeliveries]=useState<any[]>([]); const [collections,setCollections]=useState<any[]>([]); const [tasks,setTasks]=useState<any[]>([]); const [exceptions,setExceptions]=useState<any[]>([]); const [routes,setRoutes]=useState<any[]>([]); const [loading,setLoading]=useState(true);
  const load=useCallback(async()=>{ if(!user?.id)return; const s=supabase as any; const [d,c,t,e,r]=await Promise.all([
    s.from("orders").select("id,order_number,company_id,fulfillment_status,fulfillment_scheduled_for,companies(name,address)").eq("fulfillment_assigned_to",user.id).neq("status","delivered"),
    s.from("po_collection_state").select("purchase_order_id,purchase_order_number,vendor_name,status,scheduled_for,notes").eq("assigned_to",user.id).neq("status","collected"),
    s.from("team_action_items").select("*").eq("assigned_to",user.id).neq("status","done").order("due_at",{ascending:true}),
    s.from("operations_exceptions").select("*").eq("assigned_to",user.id).neq("status","resolved").order("created_at",{ascending:false}),
    s.from("dispatch_routes").select("*").eq("driver_id",user.id).not("status","in","(completed,cancelled)").order("route_date",{ascending:true}),
  ]); setDeliveries(d.data||[]);setCollections(c.data||[]);setTasks(t.data||[]);setExceptions(e.data||[]);setRoutes(r.data||[]);setLoading(false);},[user?.id]);
  useEffect(()=>{void load()},[load]); useLiveData(["orders","po_collection_state","team_action_items","operations_exceptions","dispatch_routes"],()=>void load(),{channelName:"my-work-live"});
  const total=deliveries.length+collections.length+tasks.length+exceptions.length;
  const nextRoute=routes[0]; const stops=useMemo(()=>Array.isArray(nextRoute?.stops)?nextRoute.stops:[],[nextRoute]);
  const nowItems = [
    ...exceptions.map((item:any) => ({ id:`e-${item.id}`, kind:"Exception", title:item.title, subtitle:item.description||item.category, meta:item.severity, view:"control-tower" })),
    ...tasks.filter((item:any) => item.priority === "urgent" || (item.due_at && new Date(item.due_at) <= new Date())).map((item:any) => ({ id:`t-${item.id}`, kind:"Task", title:item.title, subtitle:item.workspace||"Operations", meta:item.due_at ? `Due ${new Date(item.due_at).toLocaleDateString()}` : item.priority, view:"control-tower" })),
  ];
  const nextItems = [
    ...deliveries.map((item:any) => ({ id:`d-${item.id}`, kind:"Delivery", title:item.order_number, subtitle:item.companies?.name||"Customer", meta:item.fulfillment_scheduled_for ? new Date(item.fulfillment_scheduled_for).toLocaleString() : "Ready to plan", view:"fulfillment" })),
    ...collections.map((item:any) => ({ id:`c-${item.purchase_order_id}`, kind:"Collection", title:item.purchase_order_number, subtitle:item.vendor_name||"Supplier", meta:item.scheduled_for ? new Date(item.scheduled_for).toLocaleString() : "Ready to plan", view:"fulfillment" })),
  ];
  const urgentTaskIds = new Set(nowItems.filter((item:any)=>item.id.startsWith("t-")).map((item:any)=>item.id.slice(2)));
  const waitingItems = tasks.filter((item:any)=>!urgentTaskIds.has(item.id)).map((item:any)=>({ id:`w-${item.id}`, kind:"Task", title:item.title, subtitle:item.workspace||"Operations", meta:item.due_at ? `Due ${new Date(item.due_at).toLocaleDateString()}` : (item.priority||"Waiting"), view:"control-tower" }));

  return <div className="mx-auto max-w-6xl space-y-5 animate-in fade-in duration-300">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-xs font-bold uppercase tracking-[.18em] text-primary">Personal workspace</p><h1 className="mt-1 text-3xl font-black tracking-tight">My Work</h1><p className="mt-1 text-sm text-muted-foreground">What needs your attention, in the order it matters.</p></div>
      <Badge variant="secondary" className="w-fit rounded-full px-3 py-1">{loading?"…":total} assigned</Badge>
    </div>
    {nextRoute && <Card className="border-primary/15 bg-primary/[.035] shadow-sm"><CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex items-center gap-2"><Route className="h-4 w-4 text-primary"/><p className="truncate font-bold">{nextRoute.name}</p><Badge variant="outline" className="text-[10px]">{stops.length} stops</Badge></div><p className="mt-1 text-xs text-muted-foreground">{nextRoute.completed_stops||0} completed · active dispatch run</p></div>{nextRoute.map_url && <Button asChild size="sm" className="rounded-xl"><a href={nextRoute.map_url} target="_blank" rel="noreferrer"><Navigation className="mr-2 h-4 w-4"/>Navigate</a></Button>}</CardContent></Card>}
    <div className="grid gap-4 lg:grid-cols-[1.15fr_.85fr]">
      <WorkLane title="Now" description="Overdue, urgent or blocked" count={nowItems.length} emphasis>{nowItems.map((item:any)=><FocusRow key={item.id} {...item} onOpen={()=>onNavigate(item.view)}/>)}</WorkLane>
      <div className="space-y-4">
        <WorkLane title="Next" description="Ready for you to action" count={nextItems.length}>{nextItems.slice(0,8).map((item:any)=><FocusRow key={item.id} {...item} onOpen={()=>onNavigate(item.view)}/>)}</WorkLane>
        <WorkLane title="Waiting" description="Assigned, but not urgent yet" count={waitingItems.length}>{waitingItems.slice(0,6).map((item:any)=><FocusRow key={item.id} {...item} onOpen={()=>onNavigate(item.view)}/>)}</WorkLane>
      </div>
    </div>
  </div>;
}
function WorkLane({title,description,count,emphasis=false,children}:{title:string;description:string;count:number;emphasis?:boolean;children:React.ReactNode}) {
  return <Card className={emphasis ? "border-primary/20 shadow-sm" : "border-border/50"}><CardContent className="p-4"><div className="mb-3 flex items-start justify-between gap-3"><div><h2 className="text-base font-black">{title}</h2><p className="text-xs text-muted-foreground">{description}</p></div><Badge variant={emphasis && count ? "default" : "secondary"} className="rounded-full">{count}</Badge></div><div className="space-y-2">{count?children:<div className="rounded-xl border border-dashed border-border/60 p-5 text-center text-xs text-muted-foreground">Nothing here right now.</div>}</div></CardContent></Card>
}
function FocusRow({kind,title,subtitle,meta,onOpen}:{kind:string;title:string;subtitle:string;meta:string;onOpen:()=>void}) {
  return <button type="button" onClick={onOpen} className="group flex w-full items-center gap-3 rounded-xl border border-border/45 bg-background/60 p-3 text-left transition-colors hover:bg-muted/45"><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="text-[10px] font-bold uppercase tracking-wide text-primary">{kind}</span><p className="truncate text-sm font-bold">{title}</p></div><p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p></div><span className="hidden max-w-[140px] text-right text-[10px] font-semibold text-muted-foreground sm:block">{meta}</span><ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"/></button>
}
