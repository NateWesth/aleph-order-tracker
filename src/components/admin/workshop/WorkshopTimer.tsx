import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Maximize, Pause, Play, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { readAllRows } from "@/lib/readAllRows";
import { savedWorkTotals, type SavedWorkSession } from "@/lib/workshopTime";
import { useLiveData } from "@/hooks/useLiveData";

type Session = { id: string; state: string; accumulated_seconds: number; running_since: string | null; hourly_rate: number };
type FinishedSession = SavedWorkSession & { technician_id: string; updated_at: string; profiles: { full_name: string | null } | null };
export default function WorkshopTimer({ entityType, entityId, label, hourlyRate = 0, onFinished }: { entityType: "repair" | "sharpening" | "fabrication"; entityId: string; label: string; hourlyRate?: number; onFinished?: () => void }) {
  const { user } = useAuth(); const { toast } = useToast();
  const [session, setSession] = useState<Session | null>(null), [seconds, setSeconds] = useState(0), [busy, setBusy] = useState(false), [kiosk, setKiosk] = useState(false), [loading, setLoading] = useState(true);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [finished, setFinished] = useState<FinishedSession[]>([]), [loadError, setLoadError] = useState("");
  const db = supabase as any;
  const loadVersion = useRef(0);
  const load = useCallback(async (quiet = false) => {
    if (!user) return;
    const version = ++loadVersion.current;
    if (!quiet) setLoading(true);
    try {
      const [active, saved] = await Promise.all([
        db.from("workshop_timer_sessions").select("*").eq("entity_type", entityType).eq("entity_id", entityId).eq("technician_id", user.id).in("state", ["running", "paused"]).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        readAllRows<FinishedSession>((from, to) => db.from("workshop_timer_sessions").select("id,state,accumulated_seconds,hourly_rate,technician_id,updated_at,profiles(full_name)").eq("entity_type", entityType).eq("entity_id", entityId).eq("state", "finished").order("updated_at", { ascending: false }).order("id").range(from, to)),
      ]);
      if (active.error) throw active.error;
      if (version !== loadVersion.current) return;
      setSession(active.data); setFinished(saved); setLoadError("");
    } catch (error: any) {
      if (version !== loadVersion.current) return;
      setLoadError(error.message); toast({ title: "Work time could not load", description: error.message, variant: "destructive" });
    } finally { if (version === loadVersion.current) setLoading(false); }
  }, [entityType, entityId, user?.id, toast]);
  useEffect(() => { void load(); return () => { loadVersion.current++; }; }, [load]);
  useLiveData(["workshop_timer_sessions", "profiles"], () => load(true), { enabled: !!user });
  useEffect(() => {
    const update = () => setSeconds(Number(session?.accumulated_seconds || 0) + (session?.state === "running" && session.running_since ? Math.max(0, (Date.now() - Date.parse(session.running_since)) / 1000) : 0));
    update(); const timer = window.setInterval(update, 1000); return () => window.clearInterval(timer);
  }, [session]);
  const command = async (action: string) => {
    if (!user || loading || busy || loadError) return;
    setBusy(true);
    try {
      const { data, error } = await db.rpc("workshop_timer_command", { p_id: session?.id || requestId, p_entity_type: entityType, p_entity_id: entityId, p_action: action, p_hourly_rate: hourlyRate });
      if (error) throw error;
      // Invalidate reads started before this command so they cannot restore old state.
      loadVersion.current++;
      setLoading(false);
      setSession(data);
      if (action === "finish") { setRequestId(crypto.randomUUID()); toast({ title: "Work time saved" }); await load(); onFinished?.(); }
    } catch (error: any) { toast({ title: "Timer not changed", description: error.message, variant: "destructive" }); }
    finally { setBusy(false); }
  };
  const display = `${Math.floor(seconds / 3600).toString().padStart(2, '0')}:${Math.floor(seconds % 3600 / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
  const totals = savedWorkTotals(finished);
  const hours = (value: number) => (value / 3600).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const money = (value: number) => value.toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR' });
  const content = <section className="space-y-3 py-3"><div className="flex items-center justify-between gap-2"><h3 className="break-words font-bold">{label}</h3><Button variant="ghost" size="icon" aria-label={kiosk ? "Close kiosk" : "Open kiosk"} onClick={() => setKiosk(!kiosk)}>{kiosk ? <X className="h-5 w-5" /> : <Maximize className="h-4 w-4" />}</Button></div><p className={kiosk ? "text-center text-6xl font-bold tabular-nums" : "text-3xl font-bold tabular-nums"}>{display}</p><p className="text-xs text-muted-foreground">{loading ? "Loading…" : session?.state || "Not started"}</p>
    {loadError && <div role="alert" className="space-y-2 text-sm text-destructive"><p>Saved time could not load: {loadError}</p><Button variant="outline" size="sm" disabled={busy || loading} onClick={() => void load()}>Retry</Button></div>}
    <div className="flex flex-wrap gap-2">{session?.state !== "finished" && <><Button disabled={busy || loading || !!loadError} onClick={() => void command(session?.state === "running" ? "pause" : session ? "resume" : "start")}>{session?.state === "running" ? <Pause className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}{session?.state === "running" ? "Pause" : session ? "Resume" : "Start job"}</Button><Button variant="outline" disabled={busy || loading || !!loadError || !session} onClick={() => void command("finish")}><Check className="mr-2 h-4 w-4" />Finish time</Button></>}</div>
    {!loading && !loadError && <div className="space-y-2 border-t border-border pt-3"><div className="flex flex-wrap items-baseline justify-between gap-2"><h4 className="text-sm font-semibold">Saved work</h4><span className="text-sm font-semibold tabular-nums">{hours(totals.seconds)} hours</span></div>
      {totals.labour > 0 && <p className="text-xs text-muted-foreground">Recorded labour: {money(totals.labour)}</p>}
      {totals.unpricedSeconds > 0 && <p className="text-xs text-muted-foreground">{hours(totals.unpricedSeconds)} hours without a recorded hourly rate</p>}
      {!finished.length && <p className="text-xs text-muted-foreground">No finished sessions</p>}
      <ul className="max-h-60 space-y-2 overflow-y-auto">{finished.map(entry => <li key={entry.id} className="flex flex-wrap justify-between gap-2 border-t border-border pt-2 text-xs"><div className="min-w-0"><p className="break-words font-medium">{entry.profiles?.full_name || (entry.technician_id === user?.id ? "You" : "Team member")}</p><p className="text-muted-foreground">{new Date(entry.updated_at).toLocaleString('en-ZA')}</p></div><div className="text-right tabular-nums"><p>{hours(Number(entry.accumulated_seconds))} hours</p><p className="text-muted-foreground">{Number(entry.hourly_rate) > 0 ? `${money(Number(entry.accumulated_seconds) / 3600 * Number(entry.hourly_rate))} · ${money(Number(entry.hourly_rate))}/h` : "Hourly rate not recorded"}</p></div></li>)}</ul>
    </div>}
  </section>;
  return kiosk ? createPortal(<div className="fixed inset-0 z-[150] flex items-center justify-center overflow-y-auto bg-background p-6"><div className="w-full max-w-xl">{content}</div></div>, document.body) : content;
}