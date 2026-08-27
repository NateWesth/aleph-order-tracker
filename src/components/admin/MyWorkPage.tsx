import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, CheckCircle2, ChevronRight, MapPin, Navigation, Package, Route, Truck, Warehouse } from "lucide-react";
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
  return <div className="space-y-4 animate-in fade-in duration-300">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><Badge className="rounded-full">Personal workspace</Badge><h1 className="mt-2 text-3xl font-black">My Work</h1><p className="text-sm text-muted-foreground">Everything assigned to you, without the noise.</p></div><Badge variant="secondary" className="w-fit rounded-full px-3 py-1">{loading?"…":total} open</Badge></div>
    {nextRoute && <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/[.08] to-card"><CardContent className="p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><Route className="h-5 w-5 text-primary"/><h2 className="text-lg font-black">My active run · {nextRoute.name}</h2></div><p className="mt-1 text-xs text-muted-foreground">{stops.length} stops · {nextRoute.completed_stops||0} completed</p></div>{nextRoute.map_url && <Button asChild className="rounded-xl"><a href={nextRoute.map_url} target="_blank" rel="noreferrer"><Navigation className="mr-2 h-4 w-4"/>Navigate route</a></Button>}</div><div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{stops.slice(0,6).map((stop:any,index:number)=><div key={index} className="rounded-2xl border border-border/50 bg-background/70 p-3"><div className="flex items-center gap-2"><span className="grid h-7 w-7 place-items-center rounded-lg bg-primary text-xs font-black text-primary-foreground">{index+1}</span><Badge variant="outline" className="text-[9px] uppercase">{stop.type||"stop"}</Badge></div><p className="mt-2 text-sm font-bold">{stop.reference||stop.label||"Stop"}</p><p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground"><MapPin className="mr-1 inline h-3 w-3"/>{stop.address||"Address not set"}</p></div>)}</div></CardContent></Card>}
    <div className="grid gap-4 lg:grid-cols-2">
      <WorkSection title="Deliveries" icon={Truck} count={deliveries.length} onOpen={()=>onNavigate("fulfillment")}>{deliveries.map(d=><WorkRow key={d.id} title={d.order_number} subtitle={d.companies?.name||"Customer"} meta={d.fulfillment_scheduled_for?new Date(d.fulfillment_scheduled_for).toLocaleString():"Ready to plan"}/>)}</WorkSection>
      <WorkSection title="Collections" icon={Warehouse} count={collections.length} onOpen={()=>onNavigate("fulfillment")}>{collections.map(c=><WorkRow key={c.purchase_order_id} title={c.purchase_order_number} subtitle={c.vendor_name||"Supplier"} meta={c.scheduled_for?new Date(c.scheduled_for).toLocaleString():"Ready to plan"}/>)}</WorkSection>
      <WorkSection title="Action items" icon={CheckCircle2} count={tasks.length} onOpen={()=>onNavigate("control-tower")}>{tasks.map(t=><WorkRow key={t.id} title={t.title} subtitle={t.workspace||"Operations"} meta={t.due_at?`Due ${new Date(t.due_at).toLocaleDateString()}`:t.priority}/>)}</WorkSection>
      <WorkSection title="Exceptions" icon={Package} count={exceptions.length} onOpen={()=>onNavigate("control-tower")}>{exceptions.map(e=><WorkRow key={e.id} title={e.title} subtitle={e.description||e.category} meta={e.severity}/>)}</WorkSection>
    </div>
  </div>;
}
function WorkSection({title,icon:Icon,count,onOpen,children}:{title:string;icon:any;count:number;onOpen:()=>void;children:React.ReactNode}){return <Card className="border-border/55"><CardContent className="p-4"><div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2"><Icon className="h-4 w-4 text-primary"/><h2 className="font-black">{title}</h2><Badge variant="secondary">{count}</Badge></div><Button variant="ghost" size="sm" onClick={onOpen}>Open<ChevronRight className="ml-1 h-4 w-4"/></Button></div><div className="space-y-2">{count?children:<div className="rounded-xl bg-muted/30 p-5 text-center text-xs text-muted-foreground">Nothing assigned here.</div>}</div></CardContent></Card>}
function WorkRow({title,subtitle,meta}:{title:string;subtitle:string;meta:string}){return <div className="flex items-center gap-3 rounded-xl border border-border/45 bg-muted/20 p-3"><div className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary"><CalendarClock className="h-4 w-4"/></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{title}</p><p className="truncate text-xs text-muted-foreground">{subtitle}</p></div><span className="max-w-[120px] text-right text-[10px] font-semibold text-muted-foreground">{meta}</span></div>}
