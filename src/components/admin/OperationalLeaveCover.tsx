import { useCallback, useEffect, useState } from "react";
import { PlaneTakeoff, Plus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

type Member = { id: string; full_name: string | null; email: string | null };
type Cover = { id: string; owner_id: string; delegate_id: string; starts_at: string; ends_at: string };
export default function OperationalLeaveCover() {
  const db = supabase as any;
  const { toast } = useToast();
  const [admin, setAdmin] = useState(false);
  const [team, setTeam] = useState<Member[]>([]);
  const [covers, setCovers] = useState<Cover[]>([]);
  const [owner, setOwner] = useState("none"), [delegate, setDelegate] = useState("none");
  const [start, setStart] = useState(""), [end, setEnd] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const { data: isAdmin } = await supabase.rpc("is_admin");
    setAdmin(!!isAdmin);
    if (!isAdmin) return;
    const [p, c] = await Promise.all([supabase.from("profiles").select("id,full_name,email").eq("approved", true).order("full_name"), db.from("operational_leave_cover").select("*").eq("cancelled", false).gt("ends_at", new Date().toISOString()).order("starts_at")]);
    if (p.error || c.error) { toast({ title: "Leave cover could not load", description: (p.error || c.error).message, variant: "destructive" }); return; }
    setTeam(p.data || []); setCovers(c.data || []);
  }, [toast]);
  useEffect(() => { void load(); }, [load]);
  const save = async () => {
    if (owner === "none" || delegate === "none" || owner === delegate || !start || !end || Date.parse(end) <= Date.parse(start)) { toast({ title: "Choose two teammates and valid cover dates", variant: "destructive" }); return; }
    setBusy(true);
    const { error } = await db.from("operational_leave_cover").insert({ owner_id: owner, delegate_id: delegate, starts_at: new Date(start).toISOString(), ends_at: new Date(end).toISOString() }).select().single();
    setBusy(false);
    if (error) toast({ title: "Cover not saved", description: error.message, variant: "destructive" });
    else { toast({ title: "Purchasing & invoicing cover saved" }); await load(); }
  };
  const cancel = async (id: string) => {
    setBusy(true);
    const { error } = await db.from("operational_leave_cover").update({ cancelled: true }).eq("id", id).select().single();
    setBusy(false);
    if (error) toast({ title: "Cover not cancelled", description: error.message, variant: "destructive" }); else await load();
  };
  if (!admin) return null;
  const name = (id: string) => team.find(p => p.id === id)?.full_name || "Team member";
  return <section className="space-y-3 border-t border-border py-4">
    <h2 className="flex items-center gap-2 text-sm font-bold"><PlaneTakeoff className="h-4 w-4 text-primary" />Purchasing & invoicing leave cover</h2>
    <div className="grid gap-3 sm:grid-cols-2">
      {([['Permanent owner', owner, setOwner], ['Covering teammate', delegate, setDelegate]] as const).map(([label, value, setter]) => <div key={label}><Label>{label}</Label><Select value={value} onValueChange={setter}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Choose teammate</SelectItem>{team.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>)}</SelectContent></Select></div>)}
      <div><Label>Starts</Label><Input type="datetime-local" value={start} onChange={e => setStart(e.target.value)} /></div>
      <div><Label>Ends</Label><Input type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} /></div>
    </div>
    <Button disabled={busy} onClick={() => void save()}><Plus className="mr-2 h-4 w-4" />Save cover</Button>
    {covers.map(c => <div key={c.id} className="flex items-center gap-3 border-b border-border py-2 text-xs"><div className="min-w-0 flex-1"><strong>{name(c.owner_id)} → {name(c.delegate_id)}</strong><p className="text-muted-foreground">{new Date(c.starts_at).toLocaleString('en-ZA')} — {new Date(c.ends_at).toLocaleString('en-ZA')}</p></div><Button size="icon" variant="ghost" disabled={busy} aria-label="Cancel leave cover" onClick={() => void cancel(c.id)}><X className="h-4 w-4" /></Button></div>)}
  </section>;
}