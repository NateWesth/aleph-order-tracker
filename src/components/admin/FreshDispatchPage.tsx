import {useCallback,useEffect,useRef,useState} from "react";
import {supabase} from "@/integrations/supabase/client";
import {useAuth} from "@/contexts/AuthContext";
import {useLiveData} from "@/hooks/useLiveData";
import {useDraftRecovery} from "@/hooks/useDraftRecovery";
import {readAllRows} from "@/lib/readAllRows";
import {DISPATCH_FIELDS,DISPATCH_START,isActiveDispatch,lineRemaining,remainingUnits,type DispatchDocument} from "@/lib/dispatchDocuments";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from "@/components/ui/dialog";
import EntityComments from "./EntityComments";
import SourceDispatchPlanner from "./SourceDispatchPlanner";
import {PackageCheck,Truck,RefreshCw,Search,AlertTriangle,ArrowRight} from "lucide-react";
const db=supabase as any;
type Member={id:string;full_name:string|null};
type Health={kind:string;last_success_at:string|null;error:string|null;next_page:number};
const displayDate=(value:string|null)=>value?new Date(value).toLocaleDateString("en-ZA",{timeZone:"Africa/Johannesburg"}):"Not scheduled";

export default function FreshDispatchPage(){
 const {user}=useAuth();
 const [docs,setDocs]=useState<DispatchDocument[]>([]),[members,setMembers]=useState<Member[]>([]),[health,setHealth]=useState<Health[]>([]);
 const [mode,setMode]=useState<"collection"|"delivery">("collection"),[history,setHistory]=useState(false),[query,setQuery]=useState(""),[mine,setMine]=useState(false);
 const [loading,setLoading]=useState(true),[error,setError]=useState(""),[syncing,setSyncing]=useState(false),[progress,setProgress]=useState("");
 const [selected,setSelected]=useState<DispatchDocument|null>(null);
 const [planner,setPlanner]=useState(false);
 useEffect(()=>{
  const open=()=>{sessionStorage.removeItem("aleph:open-dispatch-planner");setPlanner(true);};
  if(sessionStorage.getItem("aleph:open-dispatch-planner"))open();
  window.addEventListener("aleph:open-dispatch-planner",open);
  return()=>window.removeEventListener("aleph:open-dispatch-planner",open);
 },[]);
 const mounted=useRef(true),syncLock=useRef(false),readVersion=useRef(0);
 const load=useCallback(async()=>{
  const version=++readVersion.current;
  try{
   const [rows,team,state]=await Promise.all([
    readAllRows<DispatchDocument>((from,to)=>db.from("dispatch_documents").select(DISPATCH_FIELDS).gte("source_created_at",DISPATCH_START).order("source_created_at",{ascending:false}).order("id").range(from,to)),
    db.from("profiles").select("id,full_name").eq("approved",true).order("full_name"),
    db.from("dispatch_sync_state").select("*")
   ]);
   if(team.error)throw team.error;if(state.error)throw state.error;
   if(!mounted.current||version!==readVersion.current)return;
   setDocs(rows);setMembers(team.data||[]);setHealth(state.data||[]);setError("");
  }catch(e:any){if(mounted.current&&version===readVersion.current)setError(e.message||"Could not load dispatch. Check that the migration was applied.");}
  finally{if(mounted.current)setLoading(false);}
 },[]);
 const sync=useCallback(async(manual=false)=>{
  if(syncLock.current||!navigator.onLine)return;
  syncLock.current=true;setSyncing(true);
  const failures:string[]=[];
  try{
   for(const kind of ["collection","delivery"]){
    try{
    let more=true;
    for(let page=0;more&&page<100&&mounted.current;page++){
     setProgress((kind==="collection"?"Purchase orders":"Customer invoices")+" · checking source page "+(page+1));
     const result=await supabase.functions.invoke("dispatch-sync",{body:{kind,refresh:manual&&page===0}});
     if(result.error||result.data?.error){
      let message=result.data?.error||result.error?.message||"Source sync failed";
      if(result.error?.context instanceof Response){try{message=(await result.error.context.json()).error||message;}catch{}}
      throw new Error(message);
     }
     if(result.data?.warning)throw new Error(result.data.warning);
     more=result.data?.hasMore===true;
     await load();
     if(result.data?.syncing){setProgress("Another teammate is refreshing Zoho. Updates will appear live.");break;}
     if(more&&page===99)throw new Error("Initial import is still in progress. Tap Refresh sources to continue the next pages.");
    }
    }catch(e:any){failures.push((kind==="collection"?"Purchase orders: ":"Invoices: ")+e.message);}
   }
   if(mounted.current&&failures.length)setError(failures.join(" · "));
  }catch(e:any){if(mounted.current)setError(e.message);}
  finally{syncLock.current=false;if(mounted.current){setSyncing(false);setProgress("");}}
 },[load]);
 useEffect(()=>{
  mounted.current=true;void load();void sync();
  const tick=()=>{if(document.visibilityState==="visible")void sync();};
  const interval=window.setInterval(tick,60000);
  window.addEventListener("online",tick);document.addEventListener("visibilitychange",tick);
  return()=>{mounted.current=false;readVersion.current++;clearInterval(interval);window.removeEventListener("online",tick);document.removeEventListener("visibilitychange",tick);};
 },[load,sync]);
 useLiveData(["dispatch_documents","dispatch_sync_state"],load,{channelName:"fresh-dispatch"});
 useEffect(()=>{
  const open=(kind:"collection"|"delivery",id:string|null)=>{
   if(!id)return;
   const record=docs.find(doc=>doc.kind===kind&&(doc.id===id||doc.source_id===id));
   if(record){setMode(kind);setSelected(record);sessionStorage.removeItem("aleph:open-"+kind);}
  };
  const collection=(event:Event)=>open("collection",(event as CustomEvent).detail);
  const delivery=(event:Event)=>open("delivery",(event as CustomEvent).detail);
  open("collection",sessionStorage.getItem("aleph:open-collection"));open("delivery",sessionStorage.getItem("aleph:open-delivery"));
  window.addEventListener("aleph:open-collection",collection);window.addEventListener("aleph:open-delivery",delivery);
  return()=>{window.removeEventListener("aleph:open-collection",collection);window.removeEventListener("aleph:open-delivery",delivery);};
 },[docs]);
 const visible=docs.filter(doc=>doc.kind===mode&&(history?!isActiveDispatch(doc):isActiveDispatch(doc))&&(!mine||doc.assigned_to===user?.id)&&[doc.reference,doc.contact_name,doc.notes,...doc.lines.map(line=>line.name+" "+line.sku)].join(" ").toLowerCase().includes(query.toLowerCase()))
 .sort((a,b)=>Number(b.urgent)-Number(a.urgent)||a.source_created_at.localeCompare(b.source_created_at));
 const memberName=(id:string|null)=>members.find(member=>member.id===id)?.full_name||"Unassigned";
 const shownError=error||health.filter(row=>row.error).map(row=>row.kind+": "+row.error).join(" · ");
 return <div className="fresh-dispatch space-y-4">
  <header className="rounded-2xl border bg-card p-4 sm:p-6">
   <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-primary">Zoho dispatch · fresh start</p><h1 className="mt-1 text-2xl font-bold">Collections & deliveries</h1><p className="mt-2 text-sm text-muted-foreground">Only documents created from 14 September 2026 (South African time). Older work is excluded.</p></div>
   <Button variant="outline" disabled={syncing} onClick={()=>void sync(true)}><RefreshCw className={"mr-2 h-4 w-4 "+(syncing?"animate-spin":"")}/>{syncing?"Checking Zoho…":"Refresh sources"}</Button></div>
   <div className="mt-4 grid grid-cols-2 gap-2" role="tablist" aria-label="Dispatch source">
    {(["collection","delivery"] as const).map(kind=><button type="button" key={kind} role="tab" aria-selected={mode===kind} onClick={()=>{setMode(kind);setHistory(false);}} className={"min-h-14 rounded-xl border p-3 text-left "+(mode===kind?"border-primary bg-primary/10":"bg-background")}>
     <span className="flex items-center gap-2 text-sm font-semibold">{kind==="collection"?<PackageCheck className="h-4 w-4"/>:<Truck className="h-4 w-4"/>}{kind==="collection"?"Collections":"Deliveries"} <span className="ml-auto">{docs.filter(doc=>doc.kind===kind&&isActiveDispatch(doc)).length}</span></span>
     <span className="mt-1 block text-xs text-muted-foreground">{kind==="collection"?"Zoho purchase orders":"Zoho customer invoices"}</span>
    </button>)}
   </div>
   <details className="mt-3 text-xs text-muted-foreground"><summary className="cursor-pointer">Source health & last checked</summary><div className="mt-2 space-y-2">{["collection","delivery"].map(kind=>{const state=health.find(row=>row.kind===kind);return <p key={kind}>{kind==="collection"?"Purchase orders":"Invoices"}: {state?.error|| (state?.last_success_at?"Last complete source scan "+new Date(state.last_success_at).toLocaleString("en-ZA"):"No successful source scan yet")}{state&&state.next_page>1?" · import continues at page "+state.next_page:""}</p>;})}</div></details>
  </header>
  {shownError&&<div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm"><p className="font-semibold">Dispatch needs attention</p><p className="mt-1 break-words">{shownError}</p><p className="mt-2 text-xs">Existing records remain visible. An error is not an empty or fully synced board.</p><Button className="mt-2" size="sm" variant="outline" onClick={()=>{void load();void sync(true);}}>Retry</Button></div>}
  {syncing&&<p role="status" className="text-sm text-muted-foreground">{progress}</p>}
  <div className="flex flex-wrap items-center gap-3">
   <Button variant="outline" onClick={()=>setPlanner(true)}>Plan dispatch run</Button>
   <div className="relative min-w-0 flex-1 basis-48"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground"/><Input aria-label="Search dispatch documents" placeholder="Search number, customer or item…" className="pl-9" value={query} onChange={e=>setQuery(e.target.value)}/></div>
   <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={mine} onChange={e=>setMine(e.target.checked)}/> Assigned to me</label>
   <Button variant={history?"default":"outline"} onClick={()=>setHistory(value=>!value)}>{history?"Show outstanding":"History / excluded"}</Button>
  </div>
  {loading?<p role="status">Loading dispatch records…</p>:visible.length===0?<div className="rounded-2xl border border-dashed p-8 text-center"><p className="font-semibold">{shownError?"Records could not be verified":history?"No matching history":"No matching outstanding documents"}</p><p className="mt-2 text-sm text-muted-foreground">Check Source health before assuming everything is complete. Draft/void documents do not require dispatch; paid invoices can still require delivery.</p></div>:
  <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3">{visible.map(doc=><button type="button" key={doc.id} onClick={()=>setSelected(doc)} className="min-w-0 rounded-2xl border bg-card p-4 text-left shadow-sm transition hover:border-primary/50 focus-visible:outline-primary">
   <div className="flex flex-wrap justify-between gap-2"><span className="font-bold text-primary">{doc.reference}</span>{doc.urgent&&<span className="rounded-full bg-destructive/10 px-2 py-1 text-xs font-semibold text-destructive">Urgent</span>}</div>
   <p className="mt-2 break-words text-base font-semibold">{doc.contact_name}</p>
   <p className="mt-2 text-sm text-muted-foreground">{remainingUnits(doc)} units remaining · {doc.lines.length} lines</p>
   <p className="mt-1 text-xs text-muted-foreground">{memberName(doc.assigned_to)} · {doc.scheduled_for?displayDate(doc.scheduled_for):"Not scheduled"}</p>
   {history&&<p className="mt-2 text-xs">{doc.source_closed?doc.source_status:doc.status}{doc.review_required?" · source changed, review required":""}</p>}
   <span className="mt-4 flex items-center justify-between border-t pt-3 text-sm font-semibold">{history?"View record":doc.kind==="collection"?"Open collection":"Open delivery"}<ArrowRight className="h-4 w-4"/></span>
  </button>)}</div>}
  {selected&&<DispatchDocumentDialog key={selected.id} doc={selected} members={members} onClose={()=>setSelected(null)} onSaved={async()=>{await load();}}/>}
  {planner&&<SourceDispatchPlanner docs={docs} members={members} onClose={()=>setPlanner(false)} onSaved={load}/>}
 </div>;
}

function DispatchDocumentDialog({doc,members,onClose,onSaved}:{doc:DispatchDocument;members:Member[];onClose:()=>void;onSaved:()=>Promise<void>}){
 const [snapshot,setSnapshot]=useState(doc);
 const [form,setForm]=useState({assigned_to:doc.assigned_to||"",scheduled_for:doc.scheduled_for||"",urgent:doc.urgent,method:doc.method,notes:doc.notes});
 const [quantities,setQuantities]=useState<Record<string,number>>({}),[receiptNote,setReceiptNote]=useState("");
 const [attempt,setAttempt]=useState<any>(null),[dirty,setDirty]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState("");
 const [receipts,setReceipts]=useState<any[]|null>(null);
 const recovery=useDraftRecovery("fresh-dispatch:"+doc.id,{snapshot,form,quantities,receiptNote,attempt},dirty,value=>{setSnapshot(value.snapshot);setForm(value.form);setQuantities(value.quantities);setReceiptNote(value.receiptNote);setAttempt(value.attempt);setDirty(true);});
 const active=isActiveDispatch(snapshot);
 const planChanged=JSON.stringify(form)!==JSON.stringify({assigned_to:snapshot.assigned_to||"",scheduled_for:snapshot.scheduled_for||"",urgent:snapshot.urgent,method:snapshot.method,notes:snapshot.notes});
 const refresh=async()=>{const {data,error}=await db.from("dispatch_documents").select(DISPATCH_FIELDS).eq("id",doc.id).single();if(error)throw error;setSnapshot(data);return data as DispatchDocument;};
 const change=(key:string,value:any)=>{setDirty(true);setForm(current=>({...current,[key]:value}));};
 const savePlan=async()=>{
  if(saving||attempt)return;setSaving(true);setError("");
  try{
   const {error}=await db.rpc("save_dispatch_document",{p_id:doc.id,p_revision:snapshot.revision,p_patch:{...form,assigned_to:form.assigned_to||null,scheduled_for:form.scheduled_for||null}});
   if(error)throw error;
   await refresh();await onSaved();
   if(!Object.values(quantities).some(q=>q>0)&&!receiptNote){recovery.clear();setDirty(false);}
  }catch(e:any){setError(e.message);}finally{setSaving(false);}
 };
 const record=async()=>{
  if(saving)return;
  if(planChanged&&!attempt){setError("Save assignment & instructions before confirming quantities.");return;}
  const selected=Object.fromEntries(Object.entries(quantities).filter(([,qty])=>qty>0));
  if(!attempt&&!Object.keys(selected).length){setError("Enter the quantities completed now.");return;}
  const request=attempt||{p_id:doc.id,p_revision:snapshot.revision,p_request_id:crypto.randomUUID(),p_quantities:selected,p_notes:receiptNote};
  setAttempt(request);setDirty(true);setSaving(true);setError("");
  let confirmed=false;
  try{
   const {error}=await db.rpc("record_dispatch_receipt",request);
   if(error){if(error.code==="P0001")setAttempt(null);throw error;}
   confirmed=true;
   setAttempt(null);setQuantities({});setReceiptNote("");setReceipts(null);recovery.clear();setDirty(false);await refresh();await onSaved();
  }catch(e:any){setError(confirmed?"Receipt saved successfully, but the refreshed view could not load. Reload latest before recording more.":e.message+" Your draft is kept. If the connection failed, retry the same receipt.");}
  finally{setSaving(false);}
 };
 return <Dialog open onOpenChange={open=>{if(!open&&!saving)onClose();}}><DialogContent className="dispatch-document-dialog max-w-3xl">
  <DialogHeader><DialogTitle className="pr-8">{snapshot.reference} · {snapshot.kind==="collection"?"Collection":"Delivery"}</DialogTitle><DialogDescription>{snapshot.contact_name} · Created {displayDate(snapshot.source_created_at)} · Source: Zoho {snapshot.kind==="collection"?"purchase order":"customer invoice"}</DialogDescription></DialogHeader>
  {recovery.banner}
  {error&&<p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
  {snapshot.address&&<p className="break-words rounded-xl bg-muted p-3 text-sm">{snapshot.address}</p>}
  <fieldset disabled={saving||!!attempt} className="min-w-0 space-y-3">
   <details open><summary className="cursor-pointer text-sm font-semibold">Assignment & instructions</summary><div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2">
    <label className="text-sm">Assigned to<select aria-label="Assigned to" className="mt-1 h-11 w-full rounded-lg border bg-background px-2" value={form.assigned_to} onChange={e=>change("assigned_to",e.target.value)}><option value="">Unassigned</option>{members.map(member=><option key={member.id} value={member.id}>{member.full_name||"Team member"}</option>)}</select></label>
    <label className="text-sm">Scheduled date<Input aria-label="Scheduled date" type="date" value={form.scheduled_for} onChange={e=>change("scheduled_for",e.target.value)}/></label>
    <label className="text-sm">Method<select aria-label="Dispatch method" className="mt-1 h-11 w-full rounded-lg border bg-background px-2" value={form.method} onChange={e=>change("method",e.target.value)}>{(snapshot.kind==="collection"?[["pickup","Collect from supplier"],["supplier-delivery","Supplier delivers to us"]]:[["delivery","Deliver to customer"],["customer-collection","Customer collects"]]).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
    <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={form.urgent} onChange={e=>change("urgent",e.target.checked)}/> Urgent</label>
    <label className="text-sm sm:col-span-2">Instructions<Textarea aria-label="Dispatch instructions" value={form.notes} onChange={e=>change("notes",e.target.value)}/></label>
   </div><Button className="mt-3" variant="outline" onClick={savePlan}>Save assignment & instructions</Button></details>
   <h3 className="pt-2 text-sm font-bold">{active?"Enter quantities completed now":"Line details"}</h3>
   <div className="space-y-3">{snapshot.lines.map(line=><div key={line.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_5rem] items-center gap-3 rounded-xl border p-3"><div className="min-w-0"><p className="whitespace-pre-wrap break-words text-sm font-semibold">{line.name}</p><p className="mt-1 text-xs text-muted-foreground">{line.sku||"No SKU"} · {lineRemaining(snapshot,line)} of {line.quantity} remaining</p></div>{active?<Input aria-label={"Complete quantity for "+line.name} type="number" min="0" max={lineRemaining(snapshot,line)} step="any" value={quantities[line.id]||0} onChange={e=>{setDirty(true);setQuantities(current=>({...current,[line.id]:Math.max(0,Math.min(lineRemaining(snapshot,line),Number(e.target.value)||0))}));}}/>:<span className="text-right text-sm">{line.quantity}</span>}</div>)}</div>
   {active&&<><Button variant="outline" className="w-full" onClick={()=>{setDirty(true);setQuantities(Object.fromEntries(snapshot.lines.filter(line=>lineRemaining(snapshot,line)>0).map(line=>[line.id,lineRemaining(snapshot,line)])));}}>Select all remaining quantities</Button><Textarea aria-label="Receipt note" placeholder="Optional receipt / handover note" value={receiptNote} onChange={e=>{setDirty(true);setReceiptNote(e.target.value);}}/></>}
  </fieldset>
  {planChanged&&!attempt&&<p className="text-xs text-muted-foreground">Save assignment & instructions before recording quantities.</p>}
  {(active||attempt)&&<div className="flex flex-wrap gap-2"><Button className="min-h-11 flex-1" disabled={saving||(planChanged&&!attempt)} onClick={record}>{saving?"Saving…":attempt?"Check / retry same receipt":"Confirm selected quantities"}</Button><Button variant="outline" disabled={saving||!!attempt} onClick={async()=>{try{const latest=await refresh();setForm({assigned_to:latest.assigned_to||"",scheduled_for:latest.scheduled_for||"",urgent:latest.urgent,method:latest.method,notes:latest.notes});setQuantities(current=>Object.fromEntries(latest.lines.map(line=>[line.id,Math.min(current[line.id]||0,lineRemaining(latest,line))])));setError("");}catch(e:any){setError(e.message);}}}>Reload latest / reset edits</Button></div>}
  {!active&&<p className="rounded-xl bg-muted p-3 text-sm">This record is {snapshot.source_closed?snapshot.source_status:snapshot.status}. It is retained in history.</p>}
  <details onToggle={async e=>{if(!e.currentTarget.open)return;const {data,error}=await db.from("dispatch_document_receipts").select("*").eq("document_id",doc.id).order("created_at",{ascending:false});if(error)setError(error.message);else setReceipts(data||[]);}}><summary className="cursor-pointer text-sm font-semibold">Receipt history</summary>{receipts===null?<p className="mt-2 text-sm">Open to load receipts.</p>:receipts.map(receipt=><div key={receipt.id} className="mt-2 rounded-lg border p-3 text-sm"><p>{new Date(receipt.created_at).toLocaleString("en-ZA")} · {receipt.result.units} units · {members.find(member=>member.id===receipt.actor_id)?.full_name||"Team member"}</p><p className="text-xs text-muted-foreground">{receipt.notes}</p></div>)}</details>
  <EntityComments entityType={snapshot.kind} entityId={doc.id}/>
  <Button className="w-full" variant="outline" disabled={saving} onClick={onClose}>Close details</Button>
 </DialogContent></Dialog>;
}
