import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
type Line = { id: string; name: string; quantity: number };
export default function PortalReorder({ orderId, companyId, items }: { orderId: string; companyId: string; items: Line[] }) {
  const { toast } = useToast(); const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [id, setId] = useState(() => crypto.randomUUID());
  const [quantities, setQuantities] = useState<Record<string, number>>({}), [status, setStatus] = useState("");
  useEffect(() => { void (supabase as any).from("portal_reorder_requests").select("status").eq("source_order_id", orderId).order("created_at", { ascending: false }).limit(1).maybeSingle().then(({ data }: any) => setStatus(data?.status || "")); }, [orderId]);
  const save = async () => {
    const lines = items.filter(i => quantities[i.id] > 0).map(i => ({ item_id: i.id, quantity: quantities[i.id] }));
    if (!lines.length) return;
    setBusy(true);
    const { data, error } = await (supabase as any).from("portal_reorder_requests").upsert({ id, company_id: companyId, source_order_id: orderId, lines }, { onConflict: "id", ignoreDuplicates: true }).select();
    setBusy(false);
    if (error || !data?.length) { toast({ title: "Reorder request not confirmed", description: error?.message || "Refresh to check your request before trying again.", variant: "destructive" }); return; }
    setStatus("pending"); setOpen(false); toast({ title: "Reorder request sent for review" });
  };
  return <><div className="flex flex-wrap items-center gap-2"><Button size="sm" variant="outline" disabled={!items.length} onClick={() => { setId(crypto.randomUUID()); setQuantities(Object.fromEntries(items.map(i => [i.id, i.quantity]))); setOpen(true); }}><RotateCcw className="mr-2 h-4 w-4" />Request reorder</Button>{status && <span className="text-xs text-muted-foreground">Last request: {status}</span>}</div><Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[85dvh] overflow-y-auto"><DialogHeader><DialogTitle>Request reorder</DialogTitle></DialogHeader>{items.map(i => <div key={i.id} className="grid grid-cols-[1fr_90px] items-center gap-3"><Label htmlFor={`qty-${i.id}`}>{i.name}</Label><Input id={`qty-${i.id}`} type="number" min="0" max="1000000" value={quantities[i.id] || 0} onChange={e => setQuantities(q => ({ ...q, [i.id]: Number(e.target.value) }))} /></div>)}<Button disabled={busy} onClick={() => void save()}>{busy ? "Sending…" : "Submit request"}</Button></DialogContent></Dialog></>;
}