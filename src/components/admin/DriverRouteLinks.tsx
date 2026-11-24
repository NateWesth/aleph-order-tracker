import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, ChevronRight, Fuel, Navigation, Pencil, Plus, Smartphone, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { groupByParty, routeStopsFromParties, type PartyStop } from "@/lib/routeStops";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { isActiveDispatch, remainingUnits as remaining, type DispatchDocument } from "@/lib/dispatchDocuments";
import DriverVanMode, { type VanStop } from "./DriverVanMode";
import FleetTracker from "./FleetTracker";
import RouteExportLinks from "./RouteExportLinks";

const db = supabase as any;
export const sastToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg" }).format(new Date());
const MAX_WAYPOINTS = 9;
export const googleUrl = (stops: string[]) => {
  const dest = stops[stops.length - 1];
  const way = stops.slice(0, -1).slice(0, MAX_WAYPOINTS);
  const p = new URLSearchParams({ api: "1", destination: dest, travelmode: "driving" });
  if (way.length) p.set("waypoints", way.join("|"));
  return `https://www.google.com/maps/dir/?${p.toString()}`;
};
export const wazeUrl = (addr: string) => `https://waze.com/ul?q=${encodeURIComponent(addr)}&navigate=yes`;

type Member = { id: string; full_name: string | null };
type Route = { id: string; name: string; route_date: string; status: string; driver_id: string | null; stops: any[]; updated_at: string };
type Edit = { id: string; name: string; route_date: string; driver_id: string; parties: PartyStop<VanStop>[]; updated_at: string; add: string };
const pill = (on: boolean) => "rounded-full border px-2.5 py-1 text-xs font-semibold transition " + (on ? "border-logo-cyan bg-logo-cyan/15 text-logo-cyan" : "border-border text-muted-foreground hover:bg-accent");

export default function DriverRouteLinks({ docs, open, onClose, members = [], onSaved, onOpenDoc }: { docs: DispatchDocument[]; open: boolean; onClose: () => void; members?: Member[]; onSaved?: () => void; onOpenDoc?: (doc: DispatchDocument) => void }) {
  const [links, setLinks] = useState<{ source_id: string; area_id: string | null; address_override: string | null }[]>([]);
  const [areas, setAreas] = useState<Record<string, string>>({});
  const [routes, setRoutes] = useState<Route[]>([]);
  const [phones, setPhones] = useState<Record<string, string>>({});
  const [kind, setKind] = useState<"all" | "delivery" | "collection">("all");
  const [when, setWhen] = useState<"today" | "all" | "custom">("all");
  const [day, setDay] = useState(sastToday());
  const [driver, setDriver] = useState("all");
  const [tab, setTab] = useState<"stops" | "runs">("stops");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [van, setVan] = useState<VanStop[] | null>(null);
  const [fleet, setFleet] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [edit, setEdit] = useState<Edit | null>(null);
  const [saving, setSaving] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!open) return;
    Promise.all([
      db.from("dispatch_area_links").select("source_id,area_id,address_override"),
      db.from("dispatch_areas").select("id,name").order("sort_order"),
      db.from("dispatch_routes").select("id,name,route_date,status,driver_id,stops,updated_at").not("status", "in", "(completed,cancelled)").order("route_date"),
      db.from("companies").select("name,phone").not("phone", "is", null),
    ]).then(([l, a, r, c]: any[]) => {
      setLinks(l.data || []);
      setAreas(Object.fromEntries((a.data || []).map((x: any) => [x.id, x.name])));
      setRoutes(r.data || []);
      setPhones(Object.fromEntries((c.data || []).map((x: any) => [String(x.name).toLowerCase().trim(), x.phone])));
    });
  }, [open, reload]);

  const memberName = (id: string | null) => members.find((m) => m.id === id)?.full_name || (id ? "Team member" : "Unassigned");
  const addrOf = (doc: DispatchDocument) => {
    const link = links.find((l) => l.source_id === doc.source_id || l.source_id === doc.id);
    return { link, addr: (link?.address_override || doc.address || "").replace(/\s+/g, " ").trim() };
  };
  const toStop = (doc: DispatchDocument): VanStop => ({ doc, addr: addrOf(doc).addr, phone: phones[(doc.contact_name || "").toLowerCase().trim()] || null });

  const filtered = useMemo(() => docs.filter((x) => isActiveDispatch(x)
    && (kind === "all" || x.kind === kind)
    && (driver === "all" || (driver === "none" ? !x.assigned_to : x.assigned_to === driver))
    && (when === "all" ? (x.scheduled_for || ["scheduled", "on-route", "in-progress", "in_progress", "out_on_route", "planned"].includes(x.status)) : (x.scheduled_for || "").slice(0, 10) === (when === "today" ? sastToday() : day))
  ), [docs, kind, driver, when, day]);

  const groups = useMemo(() => {
    const map = new Map<string, { name: string; stops: VanStop[]; missing: DispatchDocument[]; parties: PartyStop<VanStop>[] }>();
    for (const doc of filtered) {
      const { link, addr } = addrOf(doc);
      const key = link?.area_id || "none";
      if (!map.has(key)) map.set(key, { name: link?.area_id ? areas[link.area_id] || "Area" : "No area", stops: [], missing: [], parties: [] });
      if (addr) map.get(key)!.stops.push(toStop(doc)); else map.get(key)!.missing.push(doc);
    }
    const out = [...map.values()]; for (const g of out) g.parties = groupByParty(g.stops); return out;
  }, [filtered, links, areas, phones]);

  const saveAddress = async (doc: DispatchDocument) => {
    const v = (drafts[doc.id] || "").trim(); if (!v) return;
    const { error } = await db.from("dispatch_documents").update({ address: v }).eq("id", doc.id);
    if (!error) { setDrafts((d) => ({ ...d, [doc.id]: "" })); onSaved?.(); }
  };

  const runStops = (r: Route): VanStop[] => (r.stops || []).slice().sort((a, b) => a.sequence - b.sequence).map((s) => {
    const doc = docs.find((d) => d.id === s.entityId);
    return doc ? toStop(doc) : null;
  }).filter(Boolean) as VanStop[];

  const docLabel = (doc: DispatchDocument) => doc.kind === "delivery" ? "Delivery" : "Collection";
  const partyRow = (p: PartyStop<VanStop>, i: number, scope: string) => {
    const id = scope + p.key; const isOpen = expanded === id;
    return <li key={id} className="rounded-lg border border-border/60">
      <div className="flex items-center gap-2 p-2 text-sm">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-logo-cyan/15 text-[10px] font-bold text-logo-cyan">{i + 1}</span>
        <button type="button" className="flex min-w-0 flex-1 items-center gap-1 text-left" onClick={() => setExpanded(isOpen ? null : id)} aria-expanded={isOpen}>
          <ChevronRight className={"h-4 w-4 shrink-0 transition " + (isOpen ? "rotate-90" : "")} />
          <span className="min-w-0 flex-1"><strong>{p.name}</strong>
            {!!p.deliveries && <span className="ml-1 rounded bg-logo-magenta/15 px-1 text-[9px] font-bold uppercase text-logo-magenta">{p.deliveries} drop-off{p.deliveries === 1 ? "" : "s"}</span>}
            {!!p.collections && <span className="ml-1 rounded bg-logo-violet/15 px-1 text-[9px] font-bold uppercase text-logo-violet">{p.collections} pick-up{p.collections === 1 ? "" : "s"}</span>}
            <span className="block truncate text-xs text-muted-foreground">{p.addr}</span></span>
        </button>
        <a className="rounded-full border border-border px-2 py-1 text-[10px] font-bold hover:bg-accent" href={wazeUrl(p.addr)} target="_blank" rel="noreferrer">Waze</a>
      </div>
      {isOpen && <ul className="space-y-1 border-t border-border/60 p-2">{p.docs.map(({ doc }) => <li key={doc.id}>
        <button type="button" onClick={() => onOpenDoc?.(doc)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent">
          <span className="min-w-0 flex-1"><strong>{doc.reference}</strong> · {docLabel(doc)} · {remaining(doc)} unit{remaining(doc) === 1 ? "" : "s"} outstanding
            <span className="block truncate text-xs text-muted-foreground">{doc.lines.length} line{doc.lines.length === 1 ? "" : "s"} · {memberName(doc.assigned_to)}</span></span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button></li>)}</ul>}
    </li>;
  };

  const startEdit = (r: Route) => setEdit({ id: r.id, name: r.name, route_date: r.route_date.slice(0, 10), driver_id: r.driver_id || "none", updated_at: r.updated_at, add: "", parties: groupByParty(runStops(r)) });
  const addable = useMemo(() => {
    if (!edit) return [];
    const on = new Set(edit.parties.flatMap(p => p.docs.map(s => s.doc.id)));
    return groupByParty(docs.filter(d => isActiveDispatch(d) && d.status !== "on-route" && !on.has(d.id)).map(toStop).filter(s => s.addr));
  }, [edit, docs, links, phones]);
  const move = (i: number, by: number) => setEdit(e => { if (!e) return e; const p = [...e.parties]; const j = i + by; if (j < 0 || j >= p.length) return e; [p[i], p[j]] = [p[j], p[i]]; return { ...e, parties: p }; });
  const addParty = () => setEdit(e => { if (!e) return e; const p = addable.find(x => x.key === e.add); if (!p) return e;
    const existing = e.parties.findIndex(x => x.key === p.key);
    const parties = existing >= 0 ? e.parties.map((x, i) => i === existing ? groupByParty([...x.docs, ...p.docs])[0] : x) : [...e.parties, p];
    return { ...e, parties, add: "" }; });
  const saveEdit = async () => {
    if (!edit) return; if (!edit.name.trim()) { toast({ title: "Give the route a name", variant: "destructive" }); return; }
    setSaving(true);
    const stops = routeStopsFromParties(edit.parties);
    const { data, error } = await db.from("dispatch_routes").update({ name: edit.name.trim(), route_date: edit.route_date, driver_id: edit.driver_id === "none" ? null : edit.driver_id, stops, total_stops: stops.length })
      .eq("id", edit.id).eq("updated_at", edit.updated_at).select("id");
    setSaving(false);
    if (error) { toast({ title: "Route not saved", description: error.message, variant: "destructive" }); return; }
    if (!data?.length) { toast({ title: "Route changed by someone else", description: "Reloaded the latest version — please make your edit again.", variant: "destructive" }); setEdit(null); setReload(x => x + 1); return; }
    toast({ title: "Route saved", description: `${edit.parties.length} stops · ${stops.length} documents` }); setEdit(null); setReload(x => x + 1); onSaved?.();
  };
  const editor = (r: Route) => edit && <section key={r.id} className="space-y-2 rounded-xl border border-logo-cyan p-3">
    <div className="grid gap-2 sm:grid-cols-3">
      <Input aria-label="Route name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
      <Input aria-label="Route date" type="date" value={edit.route_date} onChange={(e) => setEdit({ ...edit, route_date: e.target.value })} />
      <select aria-label="Driver" value={edit.driver_id} onChange={(e) => setEdit({ ...edit, driver_id: e.target.value })} className="h-10 rounded-md border border-input bg-background px-2 text-sm">
        <option value="none">Unassigned</option>{members.map((m) => <option key={m.id} value={m.id}>{m.full_name || "Team member"}</option>)}
      </select>
    </div>
    <ol className="space-y-1">{edit.parties.map((p, i) => <li key={p.key} className="flex items-center gap-2 rounded-lg border border-border/60 p-2 text-sm">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-logo-cyan/15 text-[10px] font-bold text-logo-cyan">{i + 1}</span>
      <span className="min-w-0 flex-1"><strong>{p.name}</strong> <span className="text-xs text-muted-foreground">· {p.docs.map(s => s.doc.reference).join(", ")}</span><span className="block truncate text-xs text-muted-foreground">{p.addr}</span></span>
      <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Move up" onClick={() => move(i, -1)} disabled={!i}><ArrowUp className="h-4 w-4" /></Button>
      <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Move down" onClick={() => move(i, 1)} disabled={i === edit.parties.length - 1}><ArrowDown className="h-4 w-4" /></Button>
      <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Remove stop" onClick={() => setEdit({ ...edit, parties: edit.parties.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4 text-destructive" /></Button>
    </li>)}{!edit.parties.length && <p className="text-xs text-muted-foreground">No stops yet — add one below.</p>}</ol>
    <div className="flex gap-2">
      <select aria-label="Add stop" value={edit.add} onChange={(e) => setEdit({ ...edit, add: e.target.value })} className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm">
        <option value="">Add a client or supplier stop…</option>
        {addable.map(p => <option key={p.key} value={p.key}>{p.name} · {p.docs.length} document{p.docs.length === 1 ? "" : "s"} · {p.addr}</option>)}
      </select>
      <Button size="sm" variant="outline" onClick={addParty} disabled={!edit.add}><Plus className="mr-1 h-4 w-4" />Add</Button>
    </div>
    <div className="flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={() => setEdit(null)}>Cancel</Button><Button size="sm" onClick={() => void saveEdit()} disabled={saving}>{saving ? "Saving…" : "Save route"}</Button></div>
  </section>;
  const visibleRuns = routes.filter((r) => driver === "all" || (driver === "none" ? !r.driver_id : r.driver_id === driver));

  return <>
    <Dialog open={open && !van && !fleet} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Navigation className="h-5 w-5 text-logo-cyan" />Driver route</DialogTitle>
          <DialogDescription>Every planned and on-route stop — deliveries and collections — one stop per client or supplier, grouped by area. Tap a stop to see its documents.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-1.5">
          <button className={pill(tab === "stops")} onClick={() => setTab("stops")}>Stops</button>
          <button className={pill(tab === "runs")} onClick={() => setTab("runs")}>Saved runs ({visibleRuns.length})</button>
          <span className="mx-1 h-4 w-px bg-border" />
          <select value={driver} onChange={(e) => setDriver(e.target.value)} className="h-7 rounded-full border border-border bg-background px-2 text-xs">
            <option value="all">Whole fleet</option><option value="none">Unassigned</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.full_name || "Team member"}</option>)}
          </select>
          <Button size="sm" variant="outline" className="ml-auto h-7" onClick={() => setFleet(true)}><Fuel className="mr-1 h-3.5 w-3.5" />Fleet</Button>
        </div>
        {tab === "stops" && <div className="flex flex-wrap items-center gap-1.5">
          {(["all", "delivery", "collection"] as const).map((k) => <button key={k} className={pill(kind === k)} onClick={() => setKind(k)}>{k === "all" ? "All stops" : k === "delivery" ? "Deliveries" : "Collections"}</button>)}
          <span className="mx-1 h-4 w-px bg-border" />
          {(["today", "all", "custom"] as const).map((k) => <button key={k} className={pill(when === k)} onClick={() => setWhen(k)}>{k === "today" ? "Today" : k === "all" ? "All planned" : "Pick date"}</button>)}
          {when === "custom" && <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="h-7 w-36 text-xs" />}
        </div>}
        <div className="max-h-[58vh] space-y-3 overflow-y-auto">
          {tab === "stops" && <>
            {!groups.length && <p className="text-sm text-muted-foreground">No planned stops match these filters.</p>}
            {groups.map((g) => <section key={g.name} className="rounded-xl border border-logo-violet/30 bg-card/60 p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{g.name} <span className="text-xs text-muted-foreground">· {g.parties.length + g.missing.length} stop{g.parties.length + g.missing.length === 1 ? "" : "s"} · {g.stops.length + g.missing.length} document{g.stops.length + g.missing.length === 1 ? "" : "s"}</span></p>
                {!!g.stops.length && <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => setVan(g.stops)}><Smartphone className="mr-1 h-4 w-4" />Van mode</Button>
                  <RouteExportLinks addresses={g.parties.map(p => p.addr)} />
                </div>}
              </div>
              <ol className="space-y-1.5">
                {g.parties.map((p, i) => partyRow(p, i, "a:" + g.name))}
                {g.missing.map((doc) => <li key={doc.id} className="rounded-lg border border-destructive/40 bg-destructive/5 p-2 text-sm">
                  <p className="flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5 text-destructive" /><strong>{doc.reference}</strong> · {doc.contact_name}<span className="ml-auto rounded bg-destructive/15 px-1.5 text-[10px] font-bold text-destructive">Missing address</span></p>
                  <div className="mt-1.5 flex gap-1.5"><Input value={drafts[doc.id] || ""} onChange={(e) => setDrafts((d) => ({ ...d, [doc.id]: e.target.value }))} placeholder="Enter the street address" className="h-8 text-xs" /><Button size="sm" className="h-8" onClick={() => void saveAddress(doc)}>Save</Button></div>
                </li>)}
              </ol>
            </section>)}
          </>}
          {tab === "runs" && <>
            {!visibleRuns.length && <p className="text-sm text-muted-foreground">No saved dispatch runs. Use "Plan dispatch run" to create one.</p>}
            {visibleRuns.map((r) => {
              const stops = runStops(r); const parties = groupByParty(stops.filter((s) => s.addr)); const gone = (r.stops || []).filter((x: any) => !stops.some((s) => s.doc.id === x.entityId));
              const missing = stops.filter((s) => !s.addr);
              if (edit?.id === r.id) return editor(r);
              return <section key={r.id} className="rounded-xl border border-logo-cyan/30 bg-card/60 p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">{r.name} <span className="text-xs text-muted-foreground">· {new Date(r.route_date).toLocaleDateString("en-ZA")} · {memberName(r.driver_id)} · {parties.length} stop{parties.length === 1 ? "" : "s"}</span></p>
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="outline" onClick={() => startEdit(r)}><Pencil className="mr-1 h-4 w-4" />Edit</Button>
                    {!!parties.length && <><Button size="sm" variant="outline" onClick={() => setVan(stops)}><Smartphone className="mr-1 h-4 w-4" />Van mode</Button>
                    <RouteExportLinks addresses={parties.map(p => p.addr)} /></>}
                  </div>
                </div>
                <ol className="space-y-1.5">{parties.map((p, i) => partyRow(p, i, "r:" + r.id))}</ol>
                {missing.map((s) => <p key={s.doc.id} className="mt-1 text-xs text-destructive">{s.doc.reference} · {s.doc.contact_name} — missing address</p>)}
                {!!gone.length && <p className="mt-1 text-xs text-muted-foreground">{gone.length} document{gone.length === 1 ? "" : "s"} on this run are already finished or no longer outstanding.</p>}
              </section>;
            })}
          </>}
        </div>
      </DialogContent>
    </Dialog>
    {van && <DriverVanMode stops={van} onClose={() => setVan(null)} onSaved={() => onSaved?.()} />}
    {fleet && <FleetTracker routes={routes} onClose={() => setFleet(false)} />}
  </>;
}
