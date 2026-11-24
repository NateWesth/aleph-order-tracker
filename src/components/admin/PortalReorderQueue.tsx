import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { loadReorderDetails, resolveReorderLines, type ReorderItem, type ReorderRequest } from "@/lib/portalReorderDetails";
export default function PortalReorderQueue() {
  const [rows, setRows] = useState<ReorderRequest[]>([]), [items, setItems] = useState<ReorderItem[]>([]), [busy, setBusy] = useState(false), [loadError, setLoadError] = useState(""), [status, setStatus] = useState("pending"), [loading, setLoading] = useState(true); const { toast } = useToast(); const db = supabase as any;
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const details = await loadReorderDetails(db, status);
      setRows(details.requests); setItems(details.items); setLoadError("");
    } catch (error: any) {
      setLoadError(error.message); toast({ title: "Reorder requests could not load", description: error.message, variant: "destructive" });
    } finally { setLoading(false); }
  }, [toast, status]);
  useEffect(() => { void load(); }, [load]);
  const review = async (id: string, status: string) => { setBusy(true); const { error } = await db.from("portal_reorder_requests").update({ status }).eq("id", id).eq("status", "pending").select().single(); setBusy(false); if (error) toast({ title: "Request not changed", description: error.message, variant: "destructive" }); else await load(); };
  return <section className="space-y-2 border-t border-border py-4"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-sm font-bold">Client reorder requests</h2><Select value={status} onValueChange={value => { setRows([]); setStatus(value); }} disabled={busy || loading}><SelectTrigger aria-label="Reorder request status" className="w-40"><SelectValue /></SelectTrigger><SelectContent>{["pending", "reviewed", "accepted", "declined"].map(value => <SelectItem key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</SelectItem>)}</SelectContent></Select></div>
    {loading ? <p className="text-xs text-muted-foreground">Loading requests…</p> : !rows.length && !loadError && <p className="text-xs text-muted-foreground">No {status} requests</p>}
    {loadError && <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive"><p>Request details could not load: {loadError}</p><Button size="sm" variant="outline" onClick={() => void load()}>Retry</Button></div>}
    {rows.map(r => <div key={r.id} className="space-y-3 border-b border-border py-3">
      <div className="flex flex-wrap items-center gap-3"><div className="min-w-0 flex-1"><p className="break-words font-semibold">{r.companies?.name} · {r.orders?.order_number}</p><p className="text-xs text-muted-foreground">{r.lines.length} lines · {new Date(r.created_at).toLocaleString('en-ZA')}</p></div>{r.status === "pending" && <><Button size="sm" disabled={busy || loading || !!loadError} onClick={() => void review(r.id, 'reviewed')}>Mark reviewed</Button><Button size="sm" variant="outline" disabled={busy || loading || !!loadError} onClick={() => void review(r.id, 'declined')}>Decline</Button></>}</div>
      <table className="w-full table-fixed text-sm"><thead><tr className="text-left text-muted-foreground"><th className="py-1 font-medium">Requested item</th><th className="w-28 py-1 text-right font-medium">Quantity</th></tr></thead><tbody>
        {resolveReorderLines(r.source_order_id, r.lines, items).map((line, index) => <tr key={`${line.item_id}-${index}`} className="border-t border-border"><td className="break-words py-2 pr-3"><p>{line.item?.name || `Original item unavailable (${line.item_id})`}</p>{line.item?.code && <p className="text-xs text-muted-foreground">{line.item.code}</p>}{line.item?.description && <p className="text-xs text-muted-foreground">{line.item.description}</p>}</td><td className="py-2 text-right tabular-nums">{Number(line.quantity).toLocaleString('en-ZA', { maximumFractionDigits: 6 })}</td></tr>)}
      </tbody></table>{r.notes && <p className="break-words text-sm text-muted-foreground">{r.notes}</p>}
    </div>)}
  </section>;
}