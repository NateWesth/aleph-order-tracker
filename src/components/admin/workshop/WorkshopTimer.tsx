import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Maximize, Pause, Play, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

type Session = { id: string; state: string; accumulated_seconds: number; running_since: string | null; hourly_rate: number };
export default function WorkshopTimer({ entityType, entityId, label, hourlyRate = 0 }: { entityType: "repair" | "sharpening" | "fabrication"; entityId: string; label: string; hourlyRate?: number }) {
  const { user } = useAuth(); const { toast } = useToast();
  const [session, setSession] = useState<Session | null>(null), [seconds, setSeconds] = useState(0), [busy, setBusy] = useState(false), [kiosk, setKiosk] = useState(false);
  const [requestId] = useState(() => crypto.randomUUID());
  const db = supabase as any;
  const load = useCallback(async () => {
    if (!user) return;
    const { data, error } = await db.from("workshop_timer_sessions").select("*").eq("entity_type", entityType).eq("entity_id", entityId).eq("technician_id", user.id).neq("state", "finished").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) toast({ title: "Timer could not load", description: error.message, variant: "destructive" }); else setSession(data);
  }, [entityType, entityId, user?.id, toast]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const update = () => setSeconds(Number(session?.accumulated_seconds || 0) + (session?.state === "running" && session.running_since ? Math.max(0, (Date.now() - Date.parse(session.running_since)) / 1000) : 0));
    update(); const timer = window.setInterval(update, 1000); return () => window.clearInterval(timer);
  }, [session]);
  const command = async (action: string) => {
    if (!user) return;
    setBusy(true);
    const { data, error } = await db.rpc("workshop_timer_command", { p_id: session?.id || requestId, p_entity_type: entityType, p_entity_id: entityId, p_action: action, p_hourly_rate: hourlyRate });
    setBusy(false);
    if (error) toast({ title: "Timer not changed", description: error.message, variant: "destructive" }); else { setSession(data); if (action === "finish") toast({ title: "Work time saved" }); }
  };
  const display = `${Math.floor(seconds / 3600).toString().padStart(2, '0')}:${Math.floor(seconds % 3600 / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
  const content = <section className="space-y-3 py-3"><div className="flex items-center justify-between gap-2"><h3 className="font-bold">{label}</h3><Button variant="ghost" size="icon" aria-label={kiosk ? "Close kiosk" : "Open kiosk"} onClick={() => setKiosk(!kiosk)}>{kiosk ? <X className="h-5 w-5" /> : <Maximize className="h-4 w-4" />}</Button></div><p className={kiosk ? "text-center text-6xl font-bold tabular-nums" : "text-3xl font-bold tabular-nums"}>{display}</p><p className="text-xs text-muted-foreground">{session?.state || "Not started"}</p><div className="flex flex-wrap gap-2">{session?.state !== "finished" && <><Button disabled={busy} onClick={() => void command(session?.state === "running" ? "pause" : session ? "resume" : "start")}>{session?.state === "running" ? <Pause className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}{session?.state === "running" ? "Pause" : session ? "Resume" : "Start job"}</Button><Button variant="outline" disabled={busy || !session} onClick={() => void command("finish")}><Check className="mr-2 h-4 w-4" />Finish time</Button></>}</div></section>;
  return kiosk ? createPortal(<div className="fixed inset-0 z-[150] flex items-center justify-center bg-background p-6"><div className="w-full max-w-xl">{content}</div></div>, document.body) : content;
}