import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Package, Truck, Warehouse, ShieldAlert } from "lucide-react";
import { queryActiveDispatch } from "@/services/dispatchDocuments";
import { supabase } from "@/integrations/supabase/client";
import { useLiveData } from "@/hooks/useLiveData";
import { isActiveOrder, orderItemBuckets } from "@/lib/orderLifecycle";
import { readAllRows } from "@/lib/readAllRows";
import { readRowsByIds } from "@/lib/readRowsByIds";

interface Props { onNavigate: (view: string) => void; }
interface Pulse { orders:number; awaiting:number; ready:number; collections:number; exceptions:number; }

export default function OperationsPulseBar({ onNavigate }: Props) {
  const [dispatchError,setDispatchError]=useState("");
  const latest=useRef(0);
  const [pulse,setPulse]=useState<Pulse>({orders:0,awaiting:0,ready:0,collections:0,exceptions:0});
  const load=useCallback(async()=>{
    const request=++latest.current;
    try {
    const s=supabase as any;
    const [orders,collections,exceptions]=await Promise.all([
      readAllRows<any>((from,to)=>s.from("orders").select("id,status,completed_date").is("completed_date",null).order("id").range(from,to)),
      queryActiveDispatch(),
      readAllRows<any>((from,to)=>s.from("operations_exceptions").select("id,status").neq("status","resolved").order("id").range(from,to)),
    ]);
    const open=orders.filter(isActiveOrder);
    const allItems=await readRowsByIds<any>(open.map(o=>o.id),(batch,from,to)=>s.from("order_items").select("id,qty_on_po,qty_received,qty_invoiced,qty_completed,quantity").in("order_id",batch).order("id").range(from,to));
    if(request!==latest.current)return;
    setDispatchError(collections.error?.message||"");
    setPulse(previous=>({
      orders:open.length,
      awaiting:allItems.filter((i:any)=>orderItemBuckets(i)['awaiting-stock']>0).length,
      ready:collections.error?previous.ready:(collections.data||[]).filter((x:any)=>x.kind==="delivery").length,
      collections:collections.error?previous.collections:(collections.data||[]).filter((x:any)=>x.kind==="collection").length,
      exceptions:exceptions.length,
    }));
    } catch(error){if(request===latest.current)setDispatchError(error instanceof Error?error.message:"Counts could not refresh");}
  },[]);
  useEffect(()=>{void load();},[load]);
  useLiveData(["orders","order_items","dispatch_documents","operations_exceptions"],()=>void load(),{channelName:"operations-pulse"});
  const items=useMemo(()=>[
    [pulse.orders,"Open Orders",Package,"orders"],
    [pulse.awaiting,"Awaiting PO",AlertTriangle,"buying-sheet"],
    [pulse.ready,"Deliveries",Truck,"fulfillment"],
    [pulse.collections,"Collections",Warehouse,"fulfillment"],
    [pulse.exceptions,"Exceptions",ShieldAlert,"control-tower"],
  ] as const,[pulse]);
  return <div className="aleph-pulse-bar hidden border-b border-border/45 bg-card/65 px-3 py-1.5 backdrop-blur-xl md:flex md:items-center md:justify-center md:gap-1.5">
    {dispatchError&&<span role="status" title={dispatchError} className="text-xs text-destructive">Counts need refreshing</span>}
    {items.map(([value,label,Icon,view])=><button key={label} onClick={()=>onNavigate(view)} className="group flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold text-muted-foreground transition hover:bg-primary/8 hover:text-foreground"><Icon className="h-3.5 w-3.5 text-primary"/><strong className="text-foreground">{value}</strong><span>{label}</span></button>)}
  </div>;
}
