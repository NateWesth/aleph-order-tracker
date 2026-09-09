import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowUpRight, CalendarCheck, CheckCircle2, RefreshCcw, Gauge, PackageOpen, Plus, Search, ShieldCheck, TimerReset, Wrench } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useLiveData } from "@/hooks/useLiveData";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type DeskTab = "returns" | "loans" | "calibration";
type TeamMember = { id: string; full_name: string | null; email: string | null };
type ReturnCase = { id:string;rma_number:string;client_name:string;item_description:string;quantity:number;reason:string;resolution:string|null;status:string;priority:string;assigned_to:string|null;due_date:string|null;created_at:string };
type LoanAsset = { id:string;asset_code:string;tool_name:string;serial_number:string|null;borrower_name:string;borrower_type:string;checked_out_at:string;due_back_at:string;returned_at:string|null;condition_out:string|null;condition_in:string|null;responsible_user_id:string|null;notes:string|null };
type CalibrationAsset = { id:string;asset_code:string;tool_name:string;serial_number:string|null;calibration_interval_months:number;last_calibrated_on:string|null;next_due_on:string;provider:string|null;certificate_reference:string|null;certificate_url:string|null;status:string;responsible_user_id:string|null;notes:string|null };

const today = () => new Date().toISOString().slice(0, 10);
const inThirtyDays = () => new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
const dateTimeLocal = (days = 0) => { const d = new Date(Date.now() + days * 86400000); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0,16); };
const prettyDate = (value?: string | null) => value ? new Intl.DateTimeFormat("en-ZA", { day:"2-digit", month:"short", year:"numeric" }).format(new Date(value)) : "Not set";
const isPast = (value?: string | null) => !!value && new Date(value).getTime() < Date.now();

export default function ServiceDeskPage() {
  const db = supabase as any;
  const { user } = useAuth();
  const { toast } = useToast();
  const [tab,setTab]=useState<DeskTab>("returns");
  const [returns,setReturns]=useState<ReturnCase[]>([]);
  const [loans,setLoans]=useState<LoanAsset[]>([]);
  const [calibrations,setCalibrations]=useState<CalibrationAsset[]>([]);
  const [team,setTeam]=useState<TeamMember[]>([]);
  const [query,setQuery]=useState("");
  const [loading,setLoading]=useState(true);
  const [loadError,setLoadError]=useState("");
  const [formOpen,setFormOpen]=useState(false);
  const [saving,setSaving]=useState(false);
  const [draft,setDraft]=useState<Record<string,unknown>>({});

  const load=useCallback(async()=>{
    try {
    const [r,l,c,p]=await Promise.all([
      db.from("return_cases").select("*").order("created_at",{ascending:false}),
      db.from("loan_assets").select("*").order("due_back_at",{ascending:true}),
      db.from("calibration_assets").select("*").order("next_due_on",{ascending:true}),
      supabase.from("profiles").select("id,full_name,email").eq("approved",true).order("full_name"),
    ]);
    const failure=[r,l,c,p].find(result=>result.error);
    if(failure) throw new Error(failure.error.message);
    setLoadError("");
    setReturns(r.data||[]);setLoans(l.data||[]);setCalibrations(c.data||[]);setTeam((p.data||[]) as TeamMember[]);setLoading(false);
    } catch(error) {setLoadError(error instanceof Error?error.message:"Registers could not load");setLoading(false);}
  },[db]);
  useEffect(()=>{void load()},[load]);
  useLiveData(["return_cases","loan_assets","calibration_assets"],load,{channelName:"service-desk-live"});

  const filtered=useMemo(()=>{
    const q=query.trim().toLowerCase();
    if(tab==="returns") return returns.filter(x=>`${x.rma_number} ${x.client_name} ${x.item_description} ${x.reason}`.toLowerCase().includes(q));
    if(tab==="loans") return loans.filter(x=>`${x.asset_code} ${x.tool_name} ${x.serial_number||""} ${x.borrower_name}`.toLowerCase().includes(q));
    return calibrations.filter(x=>`${x.asset_code} ${x.tool_name} ${x.serial_number||""} ${x.provider||""}`.toLowerCase().includes(q));
  },[tab,query,returns,loans,calibrations]);

  const openCreate=()=>{
    if(tab==="returns") setDraft({rma_number:`RMA-${new Date().getFullYear()}-`,client_name:"",item_description:"",quantity:1,reason:"",status:"requested",priority:"normal",assigned_to:null,due_date:inThirtyDays(),resolution:""});
    if(tab==="loans") setDraft({asset_code:"",tool_name:"",serial_number:"",borrower_name:"",borrower_type:"customer",checked_out_at:dateTimeLocal(),due_back_at:dateTimeLocal(7),condition_out:"Good",responsible_user_id:null,notes:""});
    if(tab==="calibration") setDraft({asset_code:"",tool_name:"",serial_number:"",calibration_interval_months:12,last_calibrated_on:today(),next_due_on:inThirtyDays(),provider:"",certificate_reference:"",certificate_url:"",status:"active",responsible_user_id:null,notes:""});
    setFormOpen(true);
  };
  const set=(key:string,value:unknown)=>setDraft(current=>({...current,[key]:value}));
  const save=async()=>{
    const required=tab==="returns"?["rma_number","client_name","item_description","reason"]:tab==="loans"?["asset_code","tool_name","borrower_name","due_back_at"]:["asset_code","tool_name","next_due_on"];
    if(required.some(key=>!String(draft[key]||"").trim())){toast({title:"Complete the required fields",variant:"destructive"});return;}
    if(tab==="loans"&&(!Number.isFinite(Date.parse(String(draft.checked_out_at)))||!Number.isFinite(Date.parse(String(draft.due_back_at)))||Date.parse(String(draft.due_back_at))<=Date.parse(String(draft.checked_out_at)))){toast({title:"Return time must be after checkout",variant:"destructive"});return;}
    setSaving(true);
    const table=tab==="returns"?"return_cases":tab==="loans"?"loan_assets":"calibration_assets";
    const payload={...draft,created_by:user?.id,...(tab==="loans"?{checked_out_at:new Date(String(draft.checked_out_at)).toISOString(),due_back_at:new Date(String(draft.due_back_at)).toISOString()}:{})};
    const {error}=await db.from(table).insert(payload);
    setSaving(false);
    if(error){toast({title:"Record could not be saved",description:error.message,variant:"destructive"});return;}
    setFormOpen(false);toast({title:tab==="returns"?"Return case opened":tab==="loans"?"Loan checked out":"Calibration asset registered"});await load();
  };
  const patchRow=async(table:string,id:string,patch:Record<string,unknown>,message:string)=>{
    const {error}=await db.from(table).update(patch).eq("id",id);
    if(error) toast({title:"Update failed",description:error.message,variant:"destructive"}); else {toast({title:message});await load();}
  };

  const openReturns=returns.filter(x=>!["completed","rejected"].includes(x.status)).length;
  const overdueLoans=loans.filter(x=>!x.returned_at&&isPast(x.due_back_at)).length;
  const dueCalibration=calibrations.filter(x=>x.status!=="retired"&&(x.status==="due"||x.status==="expired"||new Date(x.next_due_on).getTime()<Date.now()+30*86400000)).length;

  return <div className="space-y-5 pb-12 animate-in fade-in duration-300">
    {loadError&&<div role="alert" className="rounded-xl border border-destructive/30 p-4 text-sm">Registers could not refresh: {loadError}<Button variant="outline" onClick={()=>load()} className="ml-3">Retry</Button></div>}
    <section className="relative overflow-hidden rounded-[30px] border border-primary/15 bg-gradient-to-br from-card via-card to-primary/[.08] p-5 shadow-lg sm:p-7">
      <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-logo-cyan/10 blur-3xl" />
      <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><Badge className="rounded-full"><Wrench className="mr-1 h-3 w-3"/>Service desk</Badge><h1 className="mt-3 text-3xl font-black tracking-[-.04em] sm:text-4xl">Returns, loan tools and compliance—together.</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Control every item that leaves, comes back or needs certification without mixing it into the order board.</p></div><Button onClick={openCreate} className="h-11 rounded-xl"><Plus className="mr-2 h-4 w-4"/>New {tab==="returns"?"return":tab==="loans"?"loan":"asset"}</Button></div>
    </section>
    <div className="grid grid-cols-3 gap-3"><Metric icon={RefreshCcw} label="Open returns" value={openReturns} tone="text-logo-magenta"/><Metric icon={TimerReset} label="Overdue loans" value={overdueLoans} tone="text-logo-pink"/><Metric icon={ShieldCheck} label="Calibration due" value={dueCalibration} tone="text-logo-cyan"/></div>
    <Tabs value={tab} onValueChange={v=>setTab(v as DeskTab)}>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><TabsList className="h-auto w-full justify-start overflow-x-auto rounded-2xl md:w-auto"><TabsTrigger value="returns">Returns & RMA</TabsTrigger><TabsTrigger value="loans">Loan register</TabsTrigger><TabsTrigger value="calibration">Calibration</TabsTrigger></TabsList><div className="relative w-full md:max-w-sm"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/><Input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search this register…" className="h-11 rounded-xl pl-9"/></div></div>
      <TabsContent value={tab} className="mt-4"><div className="grid gap-3 xl:grid-cols-2">{loading?[1,2,3,4].map(n=><div key={n} className="h-40 animate-pulse rounded-2xl bg-muted/50"/>):loadError?<p className="p-6 text-muted-foreground">Data is unavailable. Retry before relying on these totals.</p>:filtered.length===0?<Empty tab={tab}/>:tab==="returns"?(filtered as ReturnCase[]).map(row=><ReturnCard key={row.id} row={row} team={team} onUpdate={(patch,msg)=>patchRow("return_cases",row.id,patch,msg)}/>):tab==="loans"?(filtered as LoanAsset[]).map(row=><LoanCard key={row.id} row={row} team={team} onUpdate={(patch,msg)=>patchRow("loan_assets",row.id,patch,msg)}/>):(filtered as CalibrationAsset[]).map(row=><CalibrationCard key={row.id} row={row} team={team} onUpdate={(patch,msg)=>patchRow("calibration_assets",row.id,patch,msg)}/>)}</div></TabsContent>
    </Tabs>
    <Dialog open={formOpen} onOpenChange={setFormOpen}><DialogContent className="max-h-[92dvh] w-[calc(100%-20px)] max-w-2xl overflow-y-auto rounded-[26px]"><DialogHeader><DialogTitle className="text-2xl font-black">{tab==="returns"?"Open a return case":tab==="loans"?"Check out a loan tool":"Register calibration asset"}</DialogTitle></DialogHeader><div className="grid gap-4 sm:grid-cols-2">{tab==="returns"?<ReturnForm draft={draft} set={set} team={team}/>:tab==="loans"?<LoanForm draft={draft} set={set} team={team}/>:<CalibrationForm draft={draft} set={set} team={team}/>}</div><div className="flex justify-end gap-2 pt-2"><Button variant="outline" onClick={()=>setFormOpen(false)}>Cancel</Button><Button onClick={save} disabled={saving}>{saving?"Saving…":"Save record"}</Button></div></DialogContent></Dialog>
  </div>;
}

function Metric({icon:Icon,label,value,tone}:{icon:typeof Gauge;label:string;value:number;tone:string}){return <Card className="border-border/55"><CardContent className="p-3 sm:p-4"><Icon className={cn("h-5 w-5",tone)}/><p className="mt-2 text-xl font-black sm:text-2xl">{value}</p><p className="truncate text-[10px] font-bold uppercase tracking-wide text-muted-foreground sm:text-xs">{label}</p></CardContent></Card>}
function Person({id,team}:{id:string|null;team:TeamMember[]}){const p=team.find(x=>x.id===id);return <span>{p?.full_name||p?.email||"Unassigned"}</span>}
function StatusSelect({value,options,onChange}:{value:string;options:string[];onChange:(value:string)=>void}){return <Select value={value} onValueChange={onChange}><SelectTrigger className="h-9 w-[150px] rounded-xl"><SelectValue/></SelectTrigger><SelectContent>{options.map(x=><SelectItem key={x} value={x}>{x.split("_").join(" ")}</SelectItem>)}</SelectContent></Select>}
function ReturnCard({row,team,onUpdate}:{row:ReturnCase;team:TeamMember[];onUpdate:(p:Record<string,unknown>,m:string)=>void}){const overdue=row.due_date&&isPast(row.due_date)&&!["completed","rejected"].includes(row.status);return <Card className={cn("overflow-hidden border-border/55",overdue&&"border-destructive/35")}><CardContent className="p-0"><div className="flex items-start gap-3 p-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-logo-magenta/10 text-logo-magenta"><PackageOpen className="h-5 w-5"/></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-black">{row.rma_number}</p><Badge variant={row.priority==="urgent"?"destructive":"secondary"}>{row.priority}</Badge>{overdue&&<Badge variant="destructive">Overdue</Badge>}</div><p className="truncate text-sm font-semibold">{row.client_name} · {row.item_description}</p><p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{row.reason}</p></div></div><div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/20 px-4 py-3 text-xs"><div><Person id={row.assigned_to} team={team}/><span className="text-muted-foreground"> · Due {prettyDate(row.due_date)}</span></div><StatusSelect value={row.status} options={["requested","received","inspecting","supplier_return","replacement","refund","completed","rejected"]} onChange={status=>onUpdate({status},status==="completed"?"Return completed":"Return status updated")}/></div></CardContent></Card>}
function LoanCard({row,team,onUpdate}:{row:LoanAsset;team:TeamMember[];onUpdate:(p:Record<string,unknown>,m:string)=>void}){const overdue=!row.returned_at&&isPast(row.due_back_at);return <Card className={cn("overflow-hidden border-border/55",overdue&&"border-destructive/35")}><CardContent className="p-4"><div className="flex items-start gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-logo-violet/10 text-logo-violet"><ArrowUpRight className="h-5 w-5"/></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-black">{row.asset_code}</p>{row.returned_at?<Badge className="bg-emerald-600">Returned</Badge>:overdue?<Badge variant="destructive">Overdue</Badge>:<Badge variant="secondary">On loan</Badge>}</div><p className="truncate text-sm font-semibold">{row.tool_name}{row.serial_number?` · ${row.serial_number}`:""}</p><p className="mt-1 text-xs text-muted-foreground">With {row.borrower_name} · due {prettyDate(row.due_back_at)}</p><p className="mt-1 text-[10px] text-muted-foreground">Owner: <Person id={row.responsible_user_id} team={team}/></p></div>{!row.returned_at&&<Button size="sm" onClick={()=>onUpdate({returned_at:new Date().toISOString(),condition_in:"Returned"},"Loan tool returned")}><CheckCircle2 className="mr-1 h-4 w-4"/>Return</Button>}</div></CardContent></Card>}
function CalibrationCard({row,team,onUpdate}:{row:CalibrationAsset;team:TeamMember[];onUpdate:(p:Record<string,unknown>,m:string)=>void}){const due=row.status==="due"||row.status==="expired";return <Card className={cn("overflow-hidden border-border/55",row.status==="expired"&&"border-destructive/35")}><CardContent className="p-4"><div className="flex items-start gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-logo-cyan/10 text-logo-teal"><CalendarCheck className="h-5 w-5"/></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-black">{row.asset_code}</p><Badge variant={row.status==="expired"?"destructive":"secondary"}>{row.status.split("_").join(" ")}</Badge></div><p className="truncate text-sm font-semibold">{row.tool_name}{row.serial_number?` · ${row.serial_number}`:""}</p><p className="mt-1 text-xs text-muted-foreground">Next due {prettyDate(row.next_due_on)} · every {row.calibration_interval_months} months</p><p className="mt-1 text-[10px] text-muted-foreground">{row.provider||"No provider"} · <Person id={row.responsible_user_id} team={team}/></p></div>{due&&<Button size="sm" onClick={()=>onUpdate({last_calibrated_on:today(),status:"active"},"Calibration renewed")}><ShieldCheck className="mr-1 h-4 w-4"/>Renew</Button>}</div></CardContent></Card>}
function Empty({tab}:{tab:DeskTab}){return <div className="xl:col-span-2 grid min-h-56 place-items-center rounded-[24px] border border-dashed border-border/70 text-center"><div><CheckCircle2 className="mx-auto h-9 w-9 text-emerald-600"/><p className="mt-3 font-black">No matching {tab}</p><p className="text-xs text-muted-foreground">Create the first record or change your search.</p></div></div>}
function Field({label,children,wide=false}:{label:string;children:React.ReactNode;wide?:boolean}){return <div className={wide?"sm:col-span-2":""}><Label className="mb-1.5 block text-xs font-bold">{label}</Label>{children}</div>}
function TeamSelect({value,onChange,team}:{value:unknown;onChange:(v:string|null)=>void;team:TeamMember[]}){return <Select value={String(value||"unassigned")} onValueChange={v=>onChange(v==="unassigned"?null:v)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="unassigned">Unassigned</SelectItem>{team.map(p=><SelectItem key={p.id} value={p.id}>{p.full_name||p.email}</SelectItem>)}</SelectContent></Select>}
function ReturnForm({draft,set,team}:{draft:Record<string,unknown>;set:(k:string,v:unknown)=>void;team:TeamMember[]}){return <><Field label="RMA number *"><Input value={String(draft.rma_number||"")} onChange={e=>set("rma_number",e.target.value)}/></Field><Field label="Client *"><Input value={String(draft.client_name||"")} onChange={e=>set("client_name",e.target.value)}/></Field><Field label="Item *" wide><Input value={String(draft.item_description||"")} onChange={e=>set("item_description",e.target.value)}/></Field><Field label="Quantity"><Input type="number" min={1} value={Number(draft.quantity||1)} onChange={e=>set("quantity",Number(e.target.value))}/></Field><Field label="Priority"><StatusSelect value={String(draft.priority)} options={["low","normal","high","urgent"]} onChange={v=>set("priority",v)}/></Field><Field label="Due date"><Input type="date" value={String(draft.due_date||"")} onChange={e=>set("due_date",e.target.value||null)}/></Field><Field label="Assigned to"><TeamSelect value={draft.assigned_to} onChange={v=>set("assigned_to",v)} team={team}/></Field><Field label="Reason *" wide><Textarea value={String(draft.reason||"")} onChange={e=>set("reason",e.target.value)}/></Field></>}
function LoanForm({draft,set,team}:{draft:Record<string,unknown>;set:(k:string,v:unknown)=>void;team:TeamMember[]}){return <><Field label="Asset code *"><Input value={String(draft.asset_code||"")} onChange={e=>set("asset_code",e.target.value)}/></Field><Field label="Tool name *"><Input value={String(draft.tool_name||"")} onChange={e=>set("tool_name",e.target.value)}/></Field><Field label="Serial number"><Input value={String(draft.serial_number||"")} onChange={e=>set("serial_number",e.target.value||null)}/></Field><Field label="Borrower *"><Input value={String(draft.borrower_name||"")} onChange={e=>set("borrower_name",e.target.value)}/></Field><Field label="Borrower type"><StatusSelect value={String(draft.borrower_type)} options={["customer","employee","supplier"]} onChange={v=>set("borrower_type",v)}/></Field><Field label="Responsible person"><TeamSelect value={draft.responsible_user_id} onChange={v=>set("responsible_user_id",v)} team={team}/></Field><Field label="Checked out"><Input type="datetime-local" value={String(draft.checked_out_at||"")} onChange={e=>set("checked_out_at",e.target.value)}/></Field><Field label="Due back *"><Input type="datetime-local" value={String(draft.due_back_at||"")} onChange={e=>set("due_back_at",e.target.value)}/></Field><Field label="Condition out" wide><Textarea value={String(draft.condition_out||"")} onChange={e=>set("condition_out",e.target.value)}/></Field></>}
function CalibrationForm({draft,set,team}:{draft:Record<string,unknown>;set:(k:string,v:unknown)=>void;team:TeamMember[]}){return <><Field label="Asset code *"><Input value={String(draft.asset_code||"")} onChange={e=>set("asset_code",e.target.value)}/></Field><Field label="Tool name *"><Input value={String(draft.tool_name||"")} onChange={e=>set("tool_name",e.target.value)}/></Field><Field label="Serial number"><Input value={String(draft.serial_number||"")} onChange={e=>set("serial_number",e.target.value||null)}/></Field><Field label="Interval (months)"><Input type="number" min={1} max={120} value={Number(draft.calibration_interval_months||12)} onChange={e=>set("calibration_interval_months",Number(e.target.value))}/></Field><Field label="Last calibrated"><Input type="date" value={String(draft.last_calibrated_on||"")} onChange={e=>set("last_calibrated_on",e.target.value||null)}/></Field><Field label="Next due *"><Input type="date" value={String(draft.next_due_on||"")} onChange={e=>set("next_due_on",e.target.value)}/></Field><Field label="Provider"><Input value={String(draft.provider||"")} onChange={e=>set("provider",e.target.value||null)}/></Field><Field label="Certificate reference"><Input value={String(draft.certificate_reference||"")} onChange={e=>set("certificate_reference",e.target.value||null)}/></Field><Field label="Responsible person"><TeamSelect value={draft.responsible_user_id} onChange={v=>set("responsible_user_id",v)} team={team}/></Field><Field label="Certificate URL"><Input value={String(draft.certificate_url||"")} onChange={e=>set("certificate_url",e.target.value||null)}/></Field></>}
