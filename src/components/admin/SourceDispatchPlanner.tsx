import {useState} from "react";
import {supabase} from "@/integrations/supabase/client";
import {isActiveDispatch,type DispatchDocument} from "@/lib/dispatchDocuments";
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from "@/components/ui/dialog";
import {Input} from "@/components/ui/input";
import {Button} from "@/components/ui/button";
export default function SourceDispatchPlanner({docs,members,onClose,onSaved}:{docs:DispatchDocument[];members:{id:string;full_name:string|null}[];onClose:()=>void;onSaved:()=>Promise<void>}){
 const [name,setName]=useState("Dispatch run"),[date,setDate]=useState(new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Johannesburg"}).format(new Date())),[driver,setDriver]=useState("");
 const [selected,setSelected]=useState<string[]>([]),[attempt,setAttempt]=useState<any>(null),[saving,setSaving]=useState(false),[error,setError]=useState("");
 const active=docs.filter(isActiveDispatch);
 const save=async()=>{
  if(saving)return;
  const request=attempt||{p_request_id:crypto.randomUUID(),p_plan:{name,date,driver_id:driver||null,documents:selected.map(id=>({id,revision:active.find(d=>d.id===id)?.revision}))}};
  setAttempt(request);setSaving(true);setError("");
  try{const {error}=await (supabase as any).rpc("plan_source_dispatch",request);if(error){if(error.code==="P0001")setAttempt(null);throw error;}await onSaved();onClose();}
  catch(e:any){setError(e.message+" If the connection failed, retry the same run.");}
  finally{setSaving(false);}
 };
 return <Dialog open onOpenChange={open=>{if(!open&&!saving)onClose();}}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>Plan dispatch run</DialogTitle><DialogDescription>Choose outstanding purchase orders and invoices. Stops follow your selection order; review the route in Control Tower.</DialogDescription></DialogHeader>
 {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
 <fieldset disabled={saving||!!attempt} className="min-w-0 space-y-3">
 <label className="block text-sm">Run name<Input value={name} onChange={e=>setName(e.target.value)}/></label>
 <label className="block text-sm">Run date<Input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label>
 <label className="block text-sm">Driver<select className="mt-1 h-11 w-full rounded-lg border bg-background px-2" value={driver} onChange={e=>setDriver(e.target.value)}><option value="">Keep stop assignments / driver unassigned</option>{members.map(m=><option key={m.id} value={m.id}>{m.full_name||"Team member"}</option>)}</select></label>
 <p className="text-sm font-semibold">{selected.length} selected · maximum 50 stops</p>
 {active.map(doc=><label key={doc.id} className="flex min-h-14 items-center gap-3 rounded-xl border p-3"><input type="checkbox" checked={selected.includes(doc.id)} disabled={!selected.includes(doc.id)&&selected.length>=50} onChange={e=>setSelected(ids=>e.target.checked?[...ids,doc.id]:ids.filter(id=>id!==doc.id))}/><span className="min-w-0 text-sm"><strong>{doc.reference}</strong> · {doc.kind}<span className="block break-words text-muted-foreground">{doc.contact_name}</span></span></label>)}
 {!active.length&&<p>No outstanding source documents are available.</p>}
 </fieldset>
 <Button disabled={saving||(!attempt&&(!selected.length||!date||!name.trim()))} onClick={save}>{saving?"Saving…":attempt?"Check / retry same run":"Save dispatch run"}</Button>
 <Button variant="outline" disabled={saving} onClick={onClose}>Close planner</Button>
 </DialogContent></Dialog>;
}

