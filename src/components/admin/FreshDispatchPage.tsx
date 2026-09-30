import {useCallback,useEffect,useRef,useState} from "react";
import {createPortal} from "react-dom";
import {supabase} from "@/integrations/supabase/client";
import {useAuth} from "@/contexts/AuthContext";
import {useLiveData} from "@/hooks/useLiveData";
import {useDraftRecovery} from "@/hooks/useDraftRecovery";
import {readAllRows} from "@/lib/readAllRows";
import {DISPATCH_FIELDS,DISPATCH_START,isActiveDispatch,lineRemaining,remainingUnits,type DispatchDocument} from "@/lib/dispatchDocuments";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import EntityComments from "./EntityComments";
import SourceDispatchPlanner from "./SourceDispatchPlanner";
import {PackageCheck,Truck,RefreshCw,Search,AlertTriangle,ArrowRight,CalendarDays,Navigation,Warehouse,CheckCircle2,X,UserRound,Flame,Eye,Trash2,CheckSquare,Square} from "lucide-react";
import {useIsMobile} from "@/hooks/use-mobile";
import { MenuPortal, useViewportMenuPosition } from "@/hooks/useViewportMenuPosition";
import { hasUnread, useCommentsSeen } from "@/lib/commentStyles";
const db=supabase as any;
type Member={id:string;full_name:string|null};
type Health={kind:string;last_success_at:string|null;error:string|null;next_page:number};
const displayDate=(value:string|null)=>value?new Date(value).toLocaleDateString("en-ZA",{timeZone:"Africa/Johannesburg"}):"Not scheduled";

export default function FreshDispatchPage(){
 const {user}=useAuth();
 const [docs,setDocs]=useState<DispatchDocument[]>([]),[members,setMembers]=useState<Member[]>([]),[health,setHealth]=useState<Health[]>([]);
 const [mode,setMode]=useState<"collection"|"delivery">("collection"),[history,setHistory]=useState(false),[query,setQuery]=useState(""),[mine,setMine]=useState(false),[activeLane,setActiveLane]=useState<string|null>(null);
 const [loading,setLoading]=useState(true),[error,setError]=useState(""),[syncing,setSyncing]=useState(false),[progress,setProgress]=useState("");
 const [selected,setSelected]=useState<DispatchDocument|null>(null);
 const [planner,setPlanner]=useState(false);
 const isMobile=useIsMobile();
 const [mobileLane,setMobileLane]=useState<string>("pending");
 const [menu,setMenu]=useState<{doc:DispatchDocument;x:number;y:number}|null>(null);
 const menuPosition=useViewportMenuPosition(menu?.x??0,menu?.y??0);
 const [selectMode,setSelectMode]=useState(false),[picked,setPicked]=useState<Set<string>>(new Set()),[bulkBusy,setBulkBusy]=useState(false);
 const togglePick=(id:string)=>setPicked(prev=>{const next=new Set(prev);next.has(id)?next.delete(id):next.add(id);return next;});
 useEffect(()=>{
  const open=()=>{sessionStorage.removeItem("aleph:open-dispatch-planner");setPlanner(true);};
  if(sessionStorage.getItem("aleph:open-dispatch-planner"))open();
  window.addEventListener("aleph:open-dispatch-planner",open);
  return()=>window.removeEventListener("aleph:open-dispatch-planner",open);
 },[]);
 const mounted=useRef(true),syncLock=useRef(false),readVersion=useRef(0);
 const [commentCounts,setCommentCounts]=useState<Record<string,number>>({});const commentsSeen=useCommentsSeen();
 useEffect(()=>{const ids=docs.map(d=>d.id);if(!ids.length)return;let on=true;void supabase.from("entity_comments").select("entity_type,entity_id").in("entity_id",ids).then(({data})=>{if(!on||!data)return;const m:Record<string,number>={};for(const r of data as {entity_type:string;entity_id:string}[]){const k=r.entity_type+":"+r.entity_id;m[k]=(m[k]||0)+1;}setCommentCounts(m);});return()=>{on=false;};},[docs,selected]);
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
 const lanes=mode==="collection"?[
  {id:"pending",label:"Ready to plan",description:"Pickup or supplier delivery",icon:Warehouse,docs:visible.filter(doc=>doc.status==="pending")},
  {id:"scheduled",label:"Arrival planned",description:"Upcoming stock movements",icon:CalendarDays,docs:visible.filter(doc=>doc.status==="scheduled")},
  {id:"in-progress",label:"Receiving now",description:"Record actual quantities",icon:PackageCheck,docs:visible.filter(doc=>doc.status==="in-progress")},
 ]:[
  {id:"pending",label:"Ready to plan",description:"Assign and schedule",icon:PackageCheck,docs:visible.filter(doc=>doc.status==="pending")},
  {id:"scheduled",label:"Route planned",description:"Upcoming dispatches",icon:CalendarDays,docs:visible.filter(doc=>doc.status==="scheduled")},
  {id:"in-progress",label:"Out on route",description:"Complete on handover",icon:Navigation,docs:visible.filter(doc=>doc.status==="in-progress")},
 ];
 const memberName=(id:string|null)=>members.find(member=>member.id===id)?.full_name||"Unassigned";
 const openMenu=(doc:DispatchDocument,x:number,y:number)=>setMenu({doc,x,y});
 const updateDoc=async(doc:DispatchDocument,patch:Record<string,unknown>)=>{
  setMenu(null);
  const {error:updateError}=await db.from("dispatch_documents").update(patch).eq("id",doc.id);
  if(updateError)setError(updateError.message);else await load();
 };
 const completeOne=async(doc:DispatchDocument)=>{
  const quantities=Object.fromEntries(doc.lines.map(line=>[line.id,lineRemaining(doc,line)]).filter(([,q])=>Number(q)>0));
  if(Object.keys(quantities).length){
   const {error:rpcError}=await db.rpc("record_dispatch_receipt",{p_id:doc.id,p_revision:doc.revision,p_request_id:crypto.randomUUID(),p_quantities:quantities,p_notes:"Marked complete — remaining quantities filled automatically"});
   if(rpcError)throw rpcError;
  }
  const {error:e2}=await db.from("dispatch_documents").update({status:"completed"}).eq("id",doc.id);
  if(e2)throw e2;
 };
 const runBulk=async(targets:DispatchDocument[],action:(doc:DispatchDocument)=>Promise<void>,confirmText?:string)=>{
  if(!targets.length)return;
  if(confirmText&&!window.confirm(confirmText))return;
  setMenu(null);setBulkBusy(true);const failed:string[]=[];
  for(const doc of targets){try{await action(doc);}catch(e:any){failed.push(doc.reference+": "+(e.message||"failed"));}}
  setBulkBusy(false);setPicked(new Set());await load();
  if(failed.length)setError(failed.join(" · "));
 };
 const patchAction=(patch:Record<string,unknown>)=>async(doc:DispatchDocument)=>{const {error:e}=await db.from("dispatch_documents").update(patch).eq("id",doc.id);if(e)throw e;};
 const deleteAction=patchAction({status:"dismissed"});
 const pickedDocs=visible.filter(doc=>picked.has(doc.id));
 const cardOpen=(doc:DispatchDocument)=>selectMode?()=>togglePick(doc.id):()=>setSelected(doc);
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
    <Button variant={selectMode?"default":"outline"} onClick={()=>{setSelectMode(v=>!v);setPicked(new Set());}}><CheckSquare className="mr-2 h-4 w-4"/>{selectMode?"Done selecting":"Select"}</Button>
    <Button variant={history?"default":"outline"} onClick={()=>setHistory(value=>!value)}>{history?"Show outstanding":"History / excluded"}</Button>
  </div>
  {selectMode&&<div className="sticky top-2 z-30 flex flex-wrap items-center gap-2 rounded-2xl border border-logo-violet/40 bg-card/95 p-3 shadow-lg backdrop-blur">
   <span className="text-sm font-bold">{pickedDocs.length} selected</span>
   <Button size="sm" variant="outline" onClick={()=>setPicked(pickedDocs.length===visible.length?new Set():new Set(visible.map(d=>d.id)))}>{pickedDocs.length===visible.length?"Clear all":"Select all ("+visible.length+")"}</Button>
   <select aria-label="Move selected" disabled={!pickedDocs.length||bulkBusy} className="h-9 rounded-md border bg-background px-2 text-sm" value="" onChange={e=>{const v=e.target.value;if(v)void runBulk(pickedDocs,patchAction({status:v}));}}><option value="">Move to…</option>{lanes.map(l=><option key={l.id} value={l.id}>{l.label}</option>)}</select>
   <select aria-label="Assign selected" disabled={!pickedDocs.length||bulkBusy} className="h-9 rounded-md border bg-background px-2 text-sm" value="" onChange={e=>{const v=e.target.value;if(v)void runBulk(pickedDocs,patchAction({assigned_to:v==="none"?null:v}));}}><option value="">Assign to…</option><option value="none">Unassigned</option>{members.map(m=><option key={m.id} value={m.id}>{m.full_name||"Team member"}</option>)}</select>
   <Button size="sm" variant="outline" disabled={!pickedDocs.length||bulkBusy} onClick={()=>void runBulk(pickedDocs,patchAction({urgent:true}))}><Flame className="mr-1 h-4 w-4"/>Urgent</Button>
   <Button size="sm" disabled={!pickedDocs.length||bulkBusy} onClick={()=>void runBulk(pickedDocs,completeOne,"Complete "+pickedDocs.length+" document(s)? All remaining quantities will be filled in and they move to History.")}><CheckCircle2 className="mr-1 h-4 w-4"/>Complete</Button>
   <Button size="sm" variant="destructive" disabled={!pickedDocs.length||bulkBusy} onClick={()=>void runBulk(pickedDocs,deleteAction,"Delete "+pickedDocs.length+" document(s) from the board? They move to History / excluded.")}><Trash2 className="mr-1 h-4 w-4"/>Delete</Button>
   {bulkBusy&&<span className="text-xs text-muted-foreground">Working…</span>}
  </div>}
    {loading?<p role="status">Loading dispatch records…</p>:visible.length===0?<div className="rounded-2xl border border-dashed p-8 text-center"><p className="font-semibold">{shownError?"Records could not be verified":history?"No matching history":"No matching outstanding documents"}</p><p className="mt-2 text-sm text-muted-foreground">Check Source health before assuming everything is complete. Draft and void documents do not require dispatch.</p></div>:history?
    <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3">{visible.map(doc=><DispatchCard key={doc.id} doc={doc} unread={hasUnread(commentsSeen,doc.kind+":"+doc.id,commentCounts[doc.kind+":"+doc.id]||0)} memberName={memberName} history onOpen={cardOpen(doc)} selectMode={selectMode} picked={picked.has(doc.id)} onContextMenu={(x,y)=>openMenu(doc,x,y)}/>)}</div>:
    <>{isMobile&&<div className="grid grid-cols-3 gap-2" role="tablist" aria-label="Dispatch lanes">{lanes.map((lane,index)=>{const tone=[{active:"border-logo-cyan bg-logo-cyan/10 text-logo-cyan"},{active:"border-logo-violet bg-logo-violet/10 text-logo-violet"},{active:"border-logo-magenta bg-logo-magenta/10 text-logo-magenta"}][index];const active=mobileLane===lane.id;return <button type="button" key={lane.id} role="tab" aria-selected={active} onClick={()=>setMobileLane(lane.id)} className={"min-h-12 rounded-xl border p-2 text-center "+(active?tone.active:"border-border/60 bg-card/70 text-muted-foreground")}><span className="block truncate text-[11px] font-bold">{lane.label}</span><span className="mt-0.5 block text-xs font-black">{lane.docs.length}</span></button>;})}</div>}
    <div className="fulfillment-board-grid grid min-w-0 gap-4 xl:grid-cols-3">{lanes.filter(lane=>!isMobile||lane.id===mobileLane).map((lane)=>{const index=lanes.findIndex(l=>l.id===lane.id);const Icon=lane.icon;const tone=[
     {icon:"bg-logo-cyan",selected:"border-logo-cyan ring-2 ring-logo-cyan/50 shadow-lg",hover:"hover:border-logo-cyan/40",header:"border-logo-cyan/40 bg-logo-cyan/10",pill:"bg-logo-cyan text-logo-on"},
     {icon:"bg-logo-violet",selected:"border-logo-violet ring-2 ring-logo-violet/50 shadow-lg",hover:"hover:border-logo-violet/40",header:"border-logo-violet/40 bg-logo-violet/10",pill:"bg-logo-violet text-logo-on"},
     {icon:"bg-logo-magenta",selected:"border-logo-magenta ring-2 ring-logo-magenta/50 shadow-lg",hover:"hover:border-logo-magenta/40",header:"border-logo-magenta/40 bg-logo-magenta/10",pill:"bg-logo-magenta text-logo-on"},
    ][index];const selected=activeLane===lane.id;return <section key={lane.id} onClick={()=>setActiveLane(selected?null:lane.id)} className={"fulfillment-lane flex min-w-0 cursor-pointer flex-col overflow-hidden rounded-[28px] border bg-card/70 shadow-sm transition "+(selected?tone.selected:"border-border/60 "+tone.hover)}>
     <header className={"shrink-0 border-b "+(selected?tone.header:"border-border/55")}><div className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left"><div className="flex min-w-0 items-center gap-3"><span className={"grid h-9 w-9 shrink-0 place-items-center rounded-2xl text-logo-on shadow-lg "+tone.icon}><Icon className="h-4 w-4"/></span><div className="min-w-0"><h2 className="truncate text-sm font-black">{lane.label}</h2><p className="truncate text-[10px] text-muted-foreground">{lane.description}</p></div></div><span className={"grid h-7 min-w-7 place-items-center rounded-full px-2 text-xs font-bold "+(selected?tone.pill:"bg-muted")}>{lane.docs.length}</span></div></header>
     <div className={"min-h-0 flex-1 space-y-3 p-3 sm:min-h-[420px] "+(selected?"max-h-[70vh] overflow-y-auto":"overflow-visible")}>{lane.docs.length?lane.docs.map(doc=><DispatchCard key={doc.id} doc={doc} unread={hasUnread(commentsSeen,doc.kind+":"+doc.id,commentCounts[doc.kind+":"+doc.id]||0)} memberName={memberName} onOpen={cardOpen(doc)} selectMode={selectMode} picked={picked.has(doc.id)} onContextMenu={(x,y)=>openMenu(doc,x,y)}/>):<div className="grid min-h-56 place-items-center rounded-3xl border border-dashed border-border/60 bg-muted/20 p-6 text-center"><div><CheckCircle2 className="mx-auto h-7 w-7 text-success opacity-60"/><p className="mt-3 text-xs font-bold">Lane clear</p><p className="mt-1 text-[10px] text-muted-foreground">New work appears here live.</p></div></div>}</div>
    </section>})}</div></>}
  {selected&&<DispatchDocumentDialog key={selected.id} doc={selected} members={members} onClose={()=>setSelected(null)} onSaved={async()=>{await load();}}/>}
  {planner&&<SourceDispatchPlanner docs={docs} members={members} onClose={()=>setPlanner(false)} onSaved={load}/>}
  {menu&&<MenuPortal><div className="fixed inset-0 z-[90]" onMouseDown={()=>setMenu(null)} onContextMenu={(e)=>{e.preventDefault();setMenu(null);}}>
   <div ref={menuPosition.ref} role="menu" aria-label={"Actions for "+menu.doc.reference} className="fixed z-[91] max-h-[calc(100dvh-16px)] w-60 max-w-[calc(100vw-16px)] overflow-y-auto rounded-lg border border-border bg-popover p-1.5 text-popover-foreground shadow-xl" style={menuPosition.style} onMouseDown={(e)=>e.stopPropagation()}>
    <Button variant="ghost" className="h-9 w-full justify-start px-2" onClick={()=>{setSelected(menu.doc);setMenu(null);}}><Eye className="mr-2 h-4 w-4"/>Open details</Button>
    <Button variant="ghost" className="h-9 w-full justify-start px-2" onClick={()=>void updateDoc(menu.doc,{urgent:!menu.doc.urgent})}><Flame className="mr-2 h-4 w-4"/>{menu.doc.urgent?"Remove urgent flag":"Mark as urgent"}</Button>
    <Button variant="ghost" className="h-9 w-full justify-start px-2" onClick={()=>void runBulk(picked.has(menu.doc.id)&&pickedDocs.length>1?pickedDocs:[menu.doc],completeOne,"Mark as complete? Remaining quantities will be filled in and it moves to History.")}><CheckCircle2 className="mr-2 h-4 w-4"/>Complete{picked.has(menu.doc.id)&&pickedDocs.length>1?" "+pickedDocs.length+" selected":""}</Button>
    <Button variant="ghost" className="h-9 w-full justify-start px-2 text-destructive" onClick={()=>void runBulk(picked.has(menu.doc.id)&&pickedDocs.length>1?pickedDocs:[menu.doc],deleteAction,"Delete from the board? It moves to History / excluded.")}><Trash2 className="mr-2 h-4 w-4"/>Delete{picked.has(menu.doc.id)&&pickedDocs.length>1?" "+pickedDocs.length+" selected":""}</Button>
    <Button variant="ghost" className="h-9 w-full justify-start px-2" onClick={()=>{setSelectMode(true);togglePick(menu.doc.id);setMenu(null);}}><CheckSquare className="mr-2 h-4 w-4"/>{picked.has(menu.doc.id)?"Deselect":"Select"}</Button>
    <div className="my-1 h-px bg-border"/>
    <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Move to</p>
    {lanes.filter(lane=>lane.id!==menu.doc.status).map(lane=><Button key={lane.id} variant="ghost" className="h-9 w-full justify-start px-2" onClick={()=>void updateDoc(menu.doc,{status:lane.id})}><ArrowRight className="mr-2 h-4 w-4"/>{lane.label}</Button>)}
    <div className="my-1 h-px bg-border"/>
    <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Assign to</p>
    <Button variant="ghost" className="h-9 w-full justify-start px-2" onClick={()=>void updateDoc(menu.doc,{assigned_to:null})}><UserRound className="mr-2 h-4 w-4"/>Unassigned</Button>
    {members.map(member=><Button key={member.id} variant="ghost" className="h-9 w-full justify-start px-2" onClick={()=>void updateDoc(menu.doc,{assigned_to:member.id})}><UserRound className="mr-2 h-4 w-4"/>{member.full_name||"Team member"}</Button>)}
   </div>
  </div></MenuPortal>}
 </div>;
}

function DispatchCard({doc,unread=false,memberName,history=false,onOpen,onContextMenu,selectMode=false,picked=false}:{doc:DispatchDocument;unread?:boolean;memberName:(id:string|null)=>string;history?:boolean;onOpen:()=>void;onContextMenu?:(x:number,y:number)=>void;selectMode?:boolean;picked?:boolean}){
 return <button type="button" aria-pressed={selectMode?picked:undefined} onClick={(e)=>{e.stopPropagation();onOpen();}} onContextMenu={onContextMenu?(e)=>{e.preventDefault();onContextMenu(e.clientX,e.clientY);}:undefined} className={"w-full min-w-0 rounded-xl border bg-background p-4 text-left shadow-sm transition hover:border-primary/50 focus-visible:outline-primary "+(picked?"border-logo-violet ring-2 ring-logo-violet/50":"")}>
  <div className="flex flex-wrap justify-between gap-2"><span className="flex items-center gap-2 font-bold text-primary">{selectMode&&(picked?<CheckSquare className="h-4 w-4 text-logo-violet"/>:<Square className="h-4 w-4 text-muted-foreground"/>)}{doc.reference}{unread&&<span title="New comments" className="h-2 w-2 animate-pulse rounded-full bg-logo-cyan shadow-[0_0_6px_2px_hsl(var(--logo-cyan)/0.8)]"/>}</span>{doc.urgent&&<span className="rounded-full bg-destructive/10 px-2 py-1 text-xs font-semibold text-destructive">Urgent</span>}</div>
  <p className="mt-2 break-words text-base font-semibold">{doc.contact_name}</p>
  <p className="mt-2 text-sm text-muted-foreground">{remainingUnits(doc)} units remaining · {doc.lines.length} lines</p>
  <p className="mt-1 text-xs text-muted-foreground">{memberName(doc.assigned_to)} · {doc.scheduled_for?displayDate(doc.scheduled_for):"Not scheduled"}</p>
  {history&&<p className="mt-2 text-xs">{doc.source_closed?doc.source_status:doc.status}{doc.review_required?" · source changed, review required":""}</p>}
  <span className="mt-4 flex items-center justify-between border-t pt-3 text-sm font-semibold">{history?"View record":doc.kind==="collection"?"Open collection":"Open delivery"}<ArrowRight className="h-4 w-4"/></span>
 </button>;
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
 const KindIcon=snapshot.kind==="collection"?PackageCheck:Truck;
 if(typeof document==="undefined")return null;
 return createPortal(
  <div className="fulfillment-modal-backdrop fixed inset-0 z-[120] flex items-center justify-center p-2.5 sm:p-6" role="presentation">
   <button type="button" className="absolute inset-0 bg-black/45" onClick={()=>{if(!saving)onClose();}} aria-label="Close details"/>
   <section className="fulfillment-detail-modal animate-order-floating-bubble relative flex max-h-[calc(100dvh-1.25rem)] w-full max-w-5xl flex-col overflow-hidden rounded-[28px] border border-border bg-background shadow-[0_24px_60px_-20px_hsl(var(--foreground)/0.35)] sm:max-h-[calc(100dvh-3rem)]" role="dialog" aria-modal="true" aria-label={"Dispatch "+snapshot.reference}>
    <div className="ribbon-bar h-1.5 shrink-0" aria-hidden/>
    <header className="shrink-0 border-b border-border bg-background p-4 sm:p-5">
     <div className="flex items-start gap-3">
      <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-2xl bg-muted p-1 shadow-sm ring-1 ring-border"><img src="/lovable-uploads/e1088147-889e-43f6-bdf0-271189b88913.png" alt="" className="h-full w-full object-contain"/></span>
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary"><KindIcon className="h-5 w-5"/></span>
      <div className="min-w-0 flex-1">
       <div className="flex flex-wrap items-center gap-2"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">Dispatch management</p><span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-tighter text-primary">{snapshot.kind==="collection"?"Collection":"Delivery"}</span><span className={"rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-tighter "+(active?"border-success/30 bg-success/10 text-success":"border-border bg-muted text-muted-foreground")}>{active?"Active":snapshot.source_closed?snapshot.source_status:snapshot.status}</span>{snapshot.urgent&&<span className="rounded-full border border-destructive/30 bg-destructive/10 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-tighter text-destructive">Urgent</span>}</div>
        <h2 className="mt-1 truncate font-display text-xl font-black tracking-tight sm:text-2xl animate-order-floating-bubble-content">{snapshot.reference}</h2>
       <p className="mt-0.5 truncate text-sm font-semibold text-muted-foreground">{snapshot.contact_name} · Created {displayDate(snapshot.source_created_at)} · Zoho {snapshot.kind==="collection"?"purchase order":"customer invoice"}</p>
      </div>
      <button type="button" onClick={()=>{if(!saving)onClose();}} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground transition-all hover:scale-105 hover:bg-destructive/10 hover:text-destructive" aria-label="Close details"><X className="h-4 w-4"/></button>
     </div>
    </header>
     <div className="flex-1 space-y-6 overflow-y-auto p-4 sm:p-6 animate-order-floating-bubble-content">
     {recovery.banner}
     {error&&<p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
     <div className="grid grid-cols-2 gap-4 rounded-xl border border-border/60 bg-muted/30 p-4 md:grid-cols-4">
      <div><p className="text-[10px] font-bold uppercase text-muted-foreground">Reference</p><p className="mt-0.5 text-sm font-medium">{snapshot.reference}</p></div>
      <div><p className="text-[10px] font-bold uppercase text-muted-foreground">Contact</p><p className="mt-0.5 truncate text-sm font-medium">{snapshot.contact_name}</p></div>
      <div><p className="text-[10px] font-bold uppercase text-muted-foreground">Created</p><p className="mt-0.5 text-sm font-medium">{displayDate(snapshot.source_created_at)}</p></div>
      <div><p className="text-[10px] font-bold uppercase text-muted-foreground">Source</p><p className="mt-0.5 text-sm font-medium">Zoho {snapshot.kind==="collection"?"purchase order":"customer invoice"}</p></div>
      {snapshot.address&&<div className="col-span-full border-t border-border/60 pt-3"><p className="text-[10px] font-bold uppercase text-muted-foreground">{snapshot.kind==="collection"?"Pickup address":"Delivery address"}</p><p className="mt-0.5 break-words text-sm">{snapshot.address}</p></div>}
     </div>
     <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <div className="lg:col-span-5">
       <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider"><span className="h-1.5 w-1.5 rounded-full bg-logo-cyan"/>Assignment & instructions</h3>
       <fieldset disabled={saving||!!attempt} className="mt-4 min-w-0 space-y-4 rounded-xl border border-border/60 bg-muted/20 p-5">
        <div className="grid grid-cols-2 gap-4">
         <label className="space-y-1.5 text-[11px] font-bold uppercase text-muted-foreground">Assignee<select aria-label="Assigned to" className="h-10 w-full rounded-lg border bg-background px-2 text-sm font-normal normal-case text-foreground" value={form.assigned_to} onChange={e=>change("assigned_to",e.target.value)}><option value="">Unassigned</option>{members.map(member=><option key={member.id} value={member.id}>{member.full_name||"Team member"}</option>)}</select></label>
         <label className="space-y-1.5 text-[11px] font-bold uppercase text-muted-foreground">Scheduled date<Input aria-label="Scheduled date" type="date" className="h-10" value={form.scheduled_for} onChange={e=>change("scheduled_for",e.target.value)}/></label>
        </div>
        <label className="block space-y-1.5 text-[11px] font-bold uppercase text-muted-foreground">Method<select aria-label="Dispatch method" className="h-10 w-full rounded-lg border bg-background px-2 text-sm font-normal normal-case text-foreground" value={form.method} onChange={e=>change("method",e.target.value)}>{(snapshot.kind==="collection"?[["pickup","Collect from supplier"],["supplier-delivery","Supplier delivers to us"]]:[["delivery","Deliver to customer"],["customer-collection","Customer collects"]]).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        <label className="flex items-center gap-3 py-1 text-xs font-bold uppercase text-foreground"><input type="checkbox" className="h-4 w-4" checked={form.urgent} onChange={e=>change("urgent",e.target.checked)}/> Mark as urgent</label>
        <label className="block space-y-1.5 text-[11px] font-bold uppercase text-muted-foreground">Instructions<Textarea aria-label="Dispatch instructions" rows={3} value={form.notes} onChange={e=>change("notes",e.target.value)} placeholder="Additional instructions for the carrier…"/></label>
        <Button className="w-full" onClick={savePlan} disabled={saving||!!attempt}>Save assignment & instructions</Button>
       </fieldset>
      </div>
      <div className="space-y-6 lg:col-span-7">
       <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
         <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider"><span className="h-1.5 w-1.5 rounded-full bg-logo-magenta"/>{active?"Line items · quantities completed now":"Line items"}</h3>
         {active&&<button type="button" className="text-[11px] font-bold uppercase text-primary hover:underline" onClick={()=>{setDirty(true);setQuantities(Object.fromEntries(snapshot.lines.filter(line=>lineRemaining(snapshot,line)>0).map(line=>[line.id,lineRemaining(snapshot,line)])));}}>Select all remaining</button>}
        </div>
        <fieldset disabled={saving||!!attempt} className="min-w-0 space-y-2">
          {snapshot.lines.map(line=>{
           const remaining=lineRemaining(snapshot,line);
           const complete=remaining<=0;
           return <div key={line.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 p-3 transition-colors hover:border-border"><div className="min-w-0 flex-1"><p className="whitespace-pre-wrap break-words text-sm font-semibold">{line.name}</p><p className="mt-1 text-xs text-muted-foreground">{line.sku||"No SKU"} · Remaining: <span className="text-foreground">{remaining} of {line.quantity}</span></p></div>{complete?<span className="flex shrink-0 items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2.5 py-1.5 text-xs font-bold text-success"><CheckCircle2 className="h-4 w-4"/>{snapshot.kind==="collection"?"Received":"Delivered"}</span>:active?<Input aria-label={"Complete quantity for "+line.name} type="number" min="0" max={remaining} step="any" className="w-20 text-center" value={quantities[line.id]||0} onChange={e=>{setDirty(true);setQuantities(current=>({...current,[line.id]:Math.max(0,Math.min(remaining,Number(e.target.value)||0))}));}}/>:<span className="text-right text-sm font-semibold">{line.quantity}</span>}</div>;
          })}
        </fieldset>
        {planChanged&&!attempt&&<p className="text-xs text-muted-foreground">Save assignment & instructions before recording quantities.</p>}
        {!active&&<p className="rounded-xl bg-muted p-3 text-sm">This record is {snapshot.source_closed?snapshot.source_status:snapshot.status}. It is retained in history.</p>}
        <details onToggle={async e=>{if(!e.currentTarget.open)return;const {data,error}=await db.from("dispatch_document_receipts").select("*").eq("document_id",doc.id).order("created_at",{ascending:false});if(error)setError(error.message);else setReceipts(data||[]);}}><summary className="cursor-pointer text-[11px] font-bold uppercase text-muted-foreground">Receipt history</summary>{receipts===null?<p className="mt-2 text-sm">Open to load receipts.</p>:<div className="mt-3 space-y-3">{receipts.map(receipt=><div key={receipt.id} className="flex gap-3 border-l-2 border-border pl-4 text-xs"><div className="whitespace-nowrap text-muted-foreground">{new Date(receipt.created_at).toLocaleString("en-ZA")}</div><div className="text-foreground">{receipt.result.units} units · {members.find(member=>member.id===receipt.actor_id)?.full_name||"Team member"}{receipt.notes?" — "+receipt.notes:""}</div></div>)}</div>}</details>
       </div>
       <EntityComments entityType={snapshot.kind} entityId={doc.id}/>
      </div>
     </div>
    </div>
    {(active||attempt)&&<footer className="shrink-0 border-t border-border bg-muted/30 p-4 sm:p-5">
     <div className="flex flex-col gap-3 md:flex-row md:items-center">
      <div className="min-w-0 flex-1"><Input aria-label="Receipt note" placeholder="Add a receipt note for this action…" value={receiptNote} onChange={e=>{setDirty(true);setReceiptNote(e.target.value);}} disabled={saving||!!attempt}/></div>
      <div className="flex gap-3">
       <Button variant="outline" disabled={saving||!!attempt} onClick={async()=>{try{const latest=await refresh();setForm({assigned_to:latest.assigned_to||"",scheduled_for:latest.scheduled_for||"",urgent:latest.urgent,method:latest.method,notes:latest.notes});setQuantities(current=>Object.fromEntries(latest.lines.map(line=>[line.id,Math.min(current[line.id]||0,lineRemaining(latest,line))])));setError("");}catch(e:any){setError(e.message);}}}>Reload</Button>
       <Button className="min-h-11" disabled={saving||(planChanged&&!attempt)} onClick={record}>{saving?"Saving…":attempt?"Check / retry same receipt":"Confirm selected quantities"}</Button>
      </div>
     </div>
    </footer>}
   </section>
  </div>,
  document.body,
 );
}
