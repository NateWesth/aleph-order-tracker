import {useCallback,useEffect,useState} from "react";
import {supabase} from "@/integrations/supabase/client";
import {useLiveData} from "@/hooks/useLiveData";
import {Button} from "@/components/ui/button";
export default function DismissedCollections({onChanged}:{onChanged:()=>void}){
 const [rows,setRows]=useState<any[]>([]);const [error,setError]=useState("");const [busy,setBusy]=useState("");
 const load=useCallback(async()=>{const {data,error}=await (supabase as any).from("collection_dismissals").select("*").eq("active",true).order("review_required",{ascending:false}).order("dismissed_at",{ascending:false}).limit(200);if(error)setError(error.message);else{setRows(data||[]);setError("");}},[]);
 useEffect(()=>{void load()},[load]);useLiveData(["collection_dismissals"],load,{channelName:"dismissal-reviews"});
 const review=async(row:any,action:string)=>{setBusy(row.purchase_order_id);const {error}=await (supabase as any).rpc("review_collection_dismissal",{p_id:row.purchase_order_id,p_action:action,p_signature:row.current_signature});setBusy("");if(error)setError(error.message);else{await load();onChanged();}};
 return <details className="rounded-2xl border bg-card p-4"><summary className="cursor-pointer text-sm font-semibold">Dismissed collections · {rows.filter(row=>row.review_required).length} changed and need review</summary>
 <p className="my-3 text-xs text-muted-foreground">Dismissed POs never return automatically. Review changed source details below. Restoring still respects the 3-week window and outstanding quantities. Showing the latest 200 dismissals.</p>
 {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
 {rows.map(row=><div key={row.purchase_order_id} className="mt-2 rounded-xl border p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-semibold">{row.purchase_order_number}</p><p className="text-xs text-muted-foreground">{new Date(row.dismissed_at).toLocaleDateString()} · {row.review_required?"Source changed — still hidden":"Hidden until you restore it"}</p></div><div className="flex gap-2">{row.review_required&&<Button size="sm" variant="outline" disabled={!!busy} onClick={()=>review(row,"keep")}>Keep dismissed</Button>}<Button size="sm" variant="outline" disabled={!!busy} onClick={()=>review(row,"restore")}>Restore</Button></div></div>
 {row.review_required&&<details className="mt-2"><summary className="cursor-pointer text-xs">Compare source details</summary><div className="grid gap-3 pt-2 sm:grid-cols-2">{[["When dismissed",row.dismissed_signature],["Latest source",row.current_signature]].map(([label,snapshot]:any)=><div key={label}><p className="text-xs font-bold">{label}</p><pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words text-[11px]">{JSON.stringify(snapshot,null,2)}</pre></div>)}</div></details>}</div>)}
 </details>;
}
