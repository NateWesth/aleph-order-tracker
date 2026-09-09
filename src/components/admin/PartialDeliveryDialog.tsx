import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useDraftRecovery } from "@/hooks/useDraftRecovery";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
type Line = {id:string;name:string;description?:string|null;code:string|null;quantity:number;qty_invoiced:number|null;qty_completed:number|null};
type Order = {id:string;order_number:string;items:Line[]};
const ready = (item:Line) => Math.max(0,Math.min(item.quantity,item.qty_invoiced||0)-(item.qty_completed||0));
export default function PartialDeliveryDialog({order,onClose,onSaved}:{order:Order;onClose:()=>void;onSaved:()=>void}) {
  const [draft,setDraft]=useState(()=>({items:order.items.filter(item=>ready(item)>0),quantities:{} as Record<string,number>,notes:"",requestId:crypto.randomUUID(),attempted:false}));
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const [editing,setEditing]=useState(false);
  const recovery=useDraftRecovery("handover:"+order.id,draft,editing,setDraftAndEdit);
  function setDraftAndEdit(value:typeof draft){setDraft(value);setEditing(true);}
  const selected=draft.items.map(item=>({item,quantity:Number(draft.quantities[item.id]||0)})).filter(line=>line.quantity>0);
  const total=selected.reduce((sum,line)=>sum+line.quantity,0);
  const reloadQuantities=async()=>{
    if(saving||draft.attempted)return;
    setSaving(true);setError("");
    try{
      const {data,error:failure}=await supabase.from("order_items").select("id,name,description,code,quantity,qty_invoiced,qty_completed").eq("order_id",order.id);
      if(failure)throw failure;
      const items=(data||[]).filter(item=>ready(item)>0);
      setEditing(true);
      setDraft(current=>({...current,items,requestId:crypto.randomUUID(),quantities:Object.fromEntries(items.map(item=>[item.id,Math.min(ready(item),current.quantities[item.id]||0)]))}));
    }catch(failure:any){setError(failure.message||"Could not refresh quantities. Your draft is unchanged.");}
    finally{setSaving(false);}
  };
  const save=async()=>{
    if(saving||!total)return;
    if(!navigator.onLine){setError("Not synced. Your handover draft is kept on this device. Reconnect and submit it.");return;}
    setSaving(true);setError("");setDraft(current=>({...current,attempted:true}));
    try{
      const {error:failure}=await (supabase as any).rpc("record_partial_delivery",{
        p_request_id:draft.requestId,p_order_id:order.id,p_notes:draft.notes,
        p_lines:selected.map(({item,quantity})=>({item_id:item.id,quantity,expected_completed:item.qty_completed||0,expected_ready:ready(item)})),
      });
      if(failure){
        if(failure.code==="P0001"){setDraft(current=>({...current,attempted:false,requestId:crypto.randomUUID()}));}
        throw new Error(failure.message);
      }
      recovery.clear();setEditing(false);onSaved();onClose();
    }catch(failure){setError(failure instanceof Error?failure.message:"Receipt not confirmed. Retry the same handover safely.");}
    finally{setSaving(false);}
  };
  return <Dialog open onOpenChange={open=>{if(!open&&!saving)onClose();}}><DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
    <DialogHeader><DialogTitle>Hand over items · {order.order_number}</DialogTitle><DialogDescription>Enter only the quantities leaving now. Everything else remains outstanding. Quantities are checked again before saving.</DialogDescription></DialogHeader>
    {recovery.banner}
    <div className="space-y-3">{draft.items.map(item=><div key={item.id} className="grid grid-cols-[1fr_90px] items-center gap-3 rounded-xl border p-3">
      <div className="min-w-0"><p className="break-words text-sm font-semibold">{item.description||item.name}</p><p className="text-xs text-muted-foreground">{item.code} · {ready(item)} ready · {ready(item)-(draft.quantities[item.id]||0)} will remain ready</p></div>
      <Input aria-label={"Quantity for "+(item.description||item.name)} type="number" min={0} max={ready(item)} step={1} disabled={saving||draft.attempted} value={draft.quantities[item.id]||0} onChange={e=>{setEditing(true);setDraft(current=>({...current,quantities:{...current.quantities,[item.id]:Math.max(0,Math.min(ready(item),Math.floor(Number(e.target.value)||0)))}}));}} />
    </div>)}</div>
    <Button variant="outline" disabled={saving||draft.attempted} onClick={()=>{setEditing(true);setDraft(current=>({...current,quantities:Object.fromEntries(current.items.map(item=>[item.id,ready(item)]))}));}}>Select all ready quantities</Button>
    <Button variant="ghost" disabled={saving||draft.attempted} onClick={reloadQuantities}>Reload current quantities</Button>
    <Textarea aria-label="Handover notes" placeholder="Optional handover notes" value={draft.notes} disabled={saving||draft.attempted} onChange={e=>{setEditing(true);setDraft(current=>({...current,notes:e.target.value}));}}/>
    {error&&<p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}{draft.attempted&&" The result is unconfirmed; retry uses the same receipt ID and will not apply it twice."}</p>}
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm font-semibold">{total} units selected</p><Button disabled={saving||!total} onClick={save}>{saving?"Saving…":draft.attempted?"Retry same handover":"Confirm selected handover"}</Button></div>
  </DialogContent></Dialog>;
}

export function DeliveryReceiptHistory({orderId}:{orderId:string}){
  const [rows,setRows]=useState<any[]>([]);const [error,setError]=useState("");
  const [open,setOpen]=useState(false);const [loading,setLoading]=useState(false);
  useEffect(()=>{
    if(!open)return;
    let active=true;setLoading(true);
    void (supabase as any).from("dispatch_receipts").select("id,created_at,lines,notes,fully_done").eq("order_id",orderId).order("created_at",{ascending:false}).limit(50)
      .then(({data,error}:any)=>{if(active){setRows(data||[]);setError(error?.message||"");setLoading(false);}});
    return()=>{active=false};
  },[orderId,open]);
  return <details className="rounded-xl border p-3" onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary className="cursor-pointer text-sm font-semibold">Handover receipts</summary>
    {loading?<p className="mt-2 text-xs">Loading receipts…</p>:error?<p role="alert" className="mt-2 text-xs text-destructive">{error}</p>:rows.length?rows.map(row=><div key={row.id} className="mt-3 border-t pt-2 text-xs"><p className="font-semibold">{new Date(row.created_at).toLocaleString()} · {row.fully_done?"Completed":"Partial"}</p>{row.lines.map((line:any)=><p key={line.item_id}>{line.quantity} × {line.name}</p>)}{row.notes&&<p className="mt-1 text-muted-foreground">{row.notes}</p>}</div>):<p className="mt-2 text-xs text-muted-foreground">No handover receipts yet.</p>}
    {rows.length===50&&<p className="mt-2 text-xs text-muted-foreground">Showing the latest 50 receipts.</p>}
  </details>;
}
