import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Fuel, MapPin, Navigation, Smartphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { isActiveDispatch, type DispatchDocument } from "@/lib/dispatchDocuments";
import DriverVanMode, { type VanStop } from "./DriverVanMode";
import FleetTracker from "./FleetTracker";

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
type Route = { id: string; name: string; route_date: string; status: string; driver_id: string | null; stops: any[] };
const pill = (on: boolean) => "rounded-full border px-2.5 py-1 text-xs font-semibold transition " + (on ? "border-logo-cyan bg-logo-cyan/15 text-logo-cyan" : "border-border text-muted-foreground hover:bg-accent");

export default function DriverRouteLinks({ docs, open, onClose, members = [], onSaved }: { docs: DispatchDocument[]; open: boolean; onClose: () => void; members?: Member[]; onSaved?: () => void }) {
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

  useEffect(() => {
    if (!open) return;
    Promise.all([
      db.from("dispatch_area_links").select("source_id,area_id,address_override"),
      db.from("dispatch_areas").select("id,name").order("sort_order"),
      db.from("dispatch_routes").select("id,name,route_date,status,driver_id,stops").not("status", "in", "(completed,cancelled)").order("route_date"),
      db.from("companies").select("name,phone").not("phone", "is", null),
    ]).then(([l, a, r, c]: any[]) => {
      setLinks(l.data || []);
      setAreas(Object.fromEntries((a.data || []).map((x: any) => [x.id, x.name])));
      setRoutes(r.data || []);
      setPhones(Object.fromEntries((c.data || []).map((x: any) => [String(x.name).toLowerCase().trim(), x.phone])));
    });
  }, [open]);

  const memberName = (id: string | null) => members.find((m) => m.id === id)?.full_name || (id ? "Team member" : "Unassigned");
  const addrOf = (doc: DispatchDocument) => {
    const link = links.find((l) => l.source_id === doc.source_id || l.source_id === doc.id);
    return { link, addr: (link?.address_override || doc.address || "").replace(/\s+/g, " ").trim() };
  };
  const toStop = (doc: DispatchDocument): VanStop => ({ doc, addr: addrOf(doc).addr, phone: phones[(doc.contact_name || "").toLowerCase().trim()] || null });

  const filtered = useMemo(() => docs.filter((x) => isActiveDispatch(x)
    && (kind === "all" || x.kind === kind)
    && (driver === "all" || (driver === "none" ? !x.assigned_to : x.assigned_to === driver))
    && (when === "all" ? (x.scheduled_for || ["scheduled", "in_progress", "out_on_route", "planned"].includes(x.status)) : (x.scheduled_for || "").slice(0, 10) === (when === "today" ? sastToday() : day))
  ), [docs, kind, driver, when, day]);

  const groups = useMemo(() => {
    const map = new Map<string, { name: string; stops: VanStop[]; missing: DispatchDocument[] }>();
    for (const doc of filtered) {
      const { link, addr } = addrOf(doc);
      const key = link?.area_id || "none";
      if (!map.has(key)) map.set(key, { name: link?.area_id ? areas[link.area_id] || "Area" : "No area", stops: [], missing: [] });
      if (addr) map.get(key)!.stops.push(toStop(doc)); else map.get(key)!.missing.push(doc);
    }
    return [...map.values()];
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
  const visibleRuns = routes.filter((r) => driver === "all" || (driver === "none" ? !r.driver_id : r.driver_id === driver));

  return <>
    <Dialog open={open && !van && !fleet} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Navigation className="h-5 w-5 text-logo-cyan" />Driver route</DialogTitle>
          <DialogDescription>Every planned and on-route stop — deliveries and collections — grouped by area.</DialogDescription>
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
                <p className="font-semibold">{g.name} <span className="text-xs text-muted-foreground">· {g.stops.length + g.missing.length} stop{g.stops.length + g.missing.length === 1 ? "" : "s"}</span></p>
                {!!g.stops.length && <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => setVan(g.stops)}><Smartphone className="mr-1 h-4 w-4" />Van mode</Button>
                  <Button size="sm" asChild><a href={googleUrl(g.stops.map((s) => s.addr))} target="_blank" rel="noreferrer"><MapPin className="mr-1 h-4 w-4" />Google Maps</a></Button>
                </div>}
              </div>
              {g.stops.length > MAX_WAYPOINTS + 1 && <p className="mb-2 text-xs text-destructive">Google Maps takes up to {MAX_WAYPOINTS + 1} stops per link — open the rest with Waze below.</p>}
              <ol className="space-y-1.5">
                {g.stops.map((s, i) => <li key={s.doc.id} className="flex items-center gap-2 text-sm">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-logo-cyan/15 text-[10px] font-bold text-logo-cyan">{i + 1}</span>
                  <span className="min-w-0 flex-1"><strong>{s.doc.reference}</strong> · {s.doc.contact_name}
                    <span className={"ml-1 rounded px-1 text-[9px] font-bold uppercase " + (s.doc.kind === "delivery" ? "bg-logo-magenta/15 text-logo-magenta" : "bg-logo-violet/15 text-logo-violet")}>{s.doc.kind}</span>
                    <span className="block truncate text-xs text-muted-foreground">{s.addr} · {memberName(s.doc.assigned_to)}</span></span>
                  <a className="rounded-full border border-border px-2 py-1 text-[10px] font-bold hover:bg-accent" href={wazeUrl(s.addr)} target="_blank" rel="noreferrer">Waze</a>
                </li>)}
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
              const stops = runStops(r); const withAddr = stops.filter((s) => s.addr);
              return <section key={r.id} className="rounded-xl border border-logo-cyan/30 bg-card/60 p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">{r.name} <span className="text-xs text-muted-foreground">· {new Date(r.route_date).toLocaleDateString("en-ZA")} · {memberName(r.driver_id)} · {r.status}</span></p>
                  {!!withAddr.length && <div className="flex gap-1.5">
                    <Button size="sm" variant="outline" onClick={() => setVan(stops)}><Smartphone className="mr-1 h-4 w-4" />Van mode</Button>
                    <Button size="sm" asChild><a href={googleUrl(withAddr.map((s) => s.addr))} target="_blank" rel="noreferrer"><MapPin className="mr-1 h-4 w-4" />Google Maps</a></Button>
                  </div>}
                </div>
                <ol className="space-y-1">{(r.stops || []).slice().sort((a, b) => a.sequence - b.sequence).map((s: any) => {
                  const live = stops.find((x) => x.doc.id === s.entityId);
                  return <li key={s.entityId} className={"flex items-center gap-2 text-sm " + (live ? "" : "opacity-50 line-through")}>
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-logo-violet/15 text-[10px] font-bold text-logo-violet">{s.sequence}</span>
                    <span className="min-w-0 flex-1 truncate"><strong>{s.reference}</strong> · {s.label}{live && !live.addr && <span className="ml-1 text-[10px] font-bold text-destructive">Missing address</span>}</span>
                  </li>;
                })}</ol>
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
