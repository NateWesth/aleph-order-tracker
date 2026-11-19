import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
export default function PortalReorderQueue() {
  const [rows, setRows] = useState<any[]>([]), [busy, setBusy] = useState(false); const { toast } = useToast(); const db = supabase as any;
  const load = useCallback(async () => { const { data, error } = await db.from("portal_reorder_requests").select("*,companies(name),orders(order_number)").eq("status", "pending").order("created_at").limit(100); if (error) toast({ title: "Reorder requests could not load", description: error.message, variant: "destructive" }); else setRows(data || []); }, [toast]);
  useEffect(() => { void load(); }, [load]);
  const review = async (id: string, status: string) => { setBusy(true); const { error } = await db.from("portal_reorder_requests").update({ status }).eq("id", id).eq("status", "pending").select().single(); setBusy(false); if (error) toast({ title: "Request not changed", description: error.message, variant: "destructive" }); else await load(); };
  if (!rows.length) return null;
  return <section className="space-y-2 border-t border-border py-4"><h2 className="text-sm font-bold">Client reorder requests</h2>{rows.map(r => <div key={r.id} className="flex flex-wrap items-center gap-3 border-b border-border py-3"><div className="min-w-0 flex-1"><p className="font-semibold">{r.companies?.name} · {r.orders?.order_number}</p><p className="text-xs text-muted-foreground">{r.lines.length} lines · {new Date(r.created_at).toLocaleString('en-ZA')}</p></div><Button size="sm" disabled={busy} onClick={() => void review(r.id, 'reviewed')}>Mark reviewed</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => void review(r.id, 'declined')}>Decline</Button></div>)}</section>;
}