import { useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, ChevronLeft, ChevronRight, MapPin, Phone, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { lineRemaining, type DispatchDocument } from "@/lib/dispatchDocuments";

const db = supabase as any;
export type VanStop = { doc: DispatchDocument; addr: string; phone: string | null };
const gmaps = (a: string) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(a)}&travelmode=driving`;
const waze = (a: string) => `https://waze.com/ul?q=${encodeURIComponent(a)}&navigate=yes`;

export default function DriverVanMode({ stops, onClose, onSaved }: { stops: VanStop[]; onClose: () => void; onSaved: () => void }) {
  const [i, setI] = useState(0);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const s = stops[i];
  const allDone = stops.every((x) => done.has(x.doc.id));

  const complete = async () => {
    if (!s) return; setBusy(true); setErr("");
    try {
      const doc = s.doc;
      const q = Object.fromEntries(doc.lines.map((l) => [l.id, lineRemaining(doc, l)]).filter(([, n]) => Number(n) > 0));
      if (Object.keys(q).length) {
        const { error } = await db.rpc("record_dispatch_receipt", { p_id: doc.id, p_revision: doc.revision, p_request_id: crypto.randomUUID(), p_quantities: q, p_notes: "Completed in Van mode" });
        if (error) throw error;
      }
      const { error: e2 } = await db.from("dispatch_documents").update({ status: "completed" }).eq("id", doc.id);
      if (e2) throw e2;
      setDone((d) => new Set(d).add(doc.id)); onSaved();
      const next = stops.findIndex((x, k) => k > i && !done.has(x.doc.id));
      if (next >= 0) setI(next);
    } catch (e: any) { setErr(e?.message || "Could not complete this stop — check your signal and try again."); }
    setBusy(false);
  };

  return createPortal(<div className="fixed inset-0 z-[120] flex flex-col bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
    <div className="flex items-center justify-between">
      <p className="text-sm font-bold text-logo-cyan">Van mode · Stop {i + 1} of {stops.length}</p>
      <Button size="icon" variant="ghost" onClick={onClose} aria-label="Close van mode"><X className="h-6 w-6" /></Button>
    </div>
    <div className="mt-2 flex gap-1">{stops.map((x, k) => <span key={x.doc.id} className={"h-1.5 flex-1 rounded-full " + (done.has(x.doc.id) ? "bg-emerald-500" : k === i ? "bg-logo-cyan" : "bg-muted")} />)}</div>
    {allDone ? <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
      <CheckCircle2 className="h-20 w-20 text-emerald-500" /><p className="text-2xl font-bold">All stops done</p>
      <Button size="lg" className="h-14 w-full max-w-sm text-lg" onClick={onClose}>Finish run</Button>
    </div> : s && <div className="flex flex-1 flex-col gap-4 overflow-y-auto py-6">
      <div>
        <span className={"rounded-full px-3 py-1 text-xs font-bold uppercase " + (s.doc.kind === "delivery" ? "bg-logo-magenta/15 text-logo-magenta" : "bg-logo-violet/15 text-logo-violet")}>{s.doc.kind}</span>
        <h1 className="mt-3 text-3xl font-bold leading-tight">{s.doc.contact_name}</h1>
        <p className="text-lg text-muted-foreground">{s.doc.reference}</p>
        <p className={"mt-3 text-lg " + (s.addr ? "" : "font-semibold text-destructive")}>{s.addr || "No address on this stop"}</p>
        <p className="mt-2 text-sm text-muted-foreground">{s.doc.lines.length} line{s.doc.lines.length === 1 ? "" : "s"} · {s.doc.lines.reduce((n, l) => n + lineRemaining(s.doc, l), 0)} units remaining</p>
        {done.has(s.doc.id) && <p className="mt-2 font-bold text-emerald-500">✓ Completed</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Button asChild size="lg" variant="outline" className="h-16 text-base" disabled={!s.phone}>
          {s.phone ? <a href={`tel:${s.phone.replace(/\s+/g, "")}`}><Phone className="mr-2 h-5 w-5" />Call</a> : <span className="opacity-50"><Phone className="mr-2 h-5 w-5" />No number</span>}
        </Button>
        <Button asChild size="lg" variant="outline" className="h-16 text-base"><a href={s.addr ? waze(s.addr) : undefined} target="_blank" rel="noreferrer">Waze</a></Button>
        <Button asChild size="lg" variant="outline" className="col-span-2 h-16 text-base"><a href={s.addr ? gmaps(s.addr) : undefined} target="_blank" rel="noreferrer"><MapPin className="mr-2 h-5 w-5" />Navigate with Google Maps</a></Button>
      </div>
      {err && <p className="text-sm text-destructive">{err}</p>}
      <div className="mt-auto space-y-3">
        <Button size="lg" className="h-20 w-full text-xl" disabled={busy || done.has(s.doc.id)} onClick={() => void complete()}><CheckCircle2 className="mr-2 h-7 w-7" />{busy ? "Saving…" : "Complete stop"}</Button>
        <div className="grid grid-cols-2 gap-3">
          <Button size="lg" variant="ghost" className="h-12" disabled={i === 0} onClick={() => setI(i - 1)}><ChevronLeft className="mr-1 h-5 w-5" />Previous</Button>
          <Button size="lg" variant="ghost" className="h-12" disabled={i >= stops.length - 1} onClick={() => setI(i + 1)}>Skip<ChevronRight className="ml-1 h-5 w-5" /></Button>
        </div>
      </div>
    </div>}
  </div>, document.body);
}
