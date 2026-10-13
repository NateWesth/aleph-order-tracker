import { useEffect, useMemo, useState } from "react";
import { MapPin, Navigation } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { isActiveDispatch, type DispatchDocument } from "@/lib/dispatchDocuments";

const db = supabase as any;
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg" }).format(new Date());
const MAX_WAYPOINTS = 9; // Google Maps URL limit for waypoints

const googleUrl = (stops: string[]) => {
  const dest = stops[stops.length - 1];
  const way = stops.slice(0, -1).slice(0, MAX_WAYPOINTS);
  const p = new URLSearchParams({ api: "1", destination: dest, travelmode: "driving" });
  if (way.length) p.set("waypoints", way.join("|"));
  return `https://www.google.com/maps/dir/?${p.toString()}`;
};
const wazeUrl = (addr: string) => `https://waze.com/ul?q=${encodeURIComponent(addr)}&navigate=yes`;

export default function DriverRouteLinks({ docs, open, onClose }: { docs: DispatchDocument[]; open: boolean; onClose: () => void }) {
  const [links, setLinks] = useState<{ source_id: string; area_id: string | null; address_override: string | null }[]>([]);
  const [areas, setAreas] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    Promise.all([db.from("dispatch_area_links").select("source_id,area_id,address_override"), db.from("dispatch_areas").select("id,name").order("sort_order")])
      .then(([l, a]: any[]) => { setLinks(l.data || []); setAreas(Object.fromEntries((a.data || []).map((x: any) => [x.id, x.name]))); });
  }, [open]);

  const groups = useMemo(() => {
    const d = today();
    const active = docs.filter((x) => x.kind === "delivery" && isActiveDispatch(x));
    const todays = active.filter((x) => (x.scheduled_for || "").slice(0, 10) === d);
    const list = todays.length ? todays : active.filter((x) => x.scheduled_for);
    const map = new Map<string, { name: string; stops: { ref: string; who: string; addr: string }[] }>();
    for (const doc of list) {
      const link = links.find((l) => l.source_id === doc.source_id || l.source_id === doc.id);
      const addr = (link?.address_override || doc.address || "").replace(/\s+/g, " ").trim();
      if (!addr) continue;
      const key = link?.area_id || "none";
      if (!map.has(key)) map.set(key, { name: link?.area_id ? areas[link.area_id] || "Area" : "No area", stops: [] });
      map.get(key)!.stops.push({ ref: doc.reference, who: doc.contact_name, addr });
    }
    return { usingToday: todays.length > 0, list: [...map.values()] };
  }, [docs, links, areas]);

  return <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><Navigation className="h-5 w-5 text-logo-cyan" />Driver route</DialogTitle>
        <DialogDescription>{groups.usingToday ? "Today's planned deliveries" : "No deliveries planned for today — showing upcoming planned deliveries"}, grouped by area. Google Maps orders the stops for the best route.</DialogDescription>
      </DialogHeader>
      <div className="max-h-[65vh] space-y-3 overflow-y-auto">
        {!groups.list.length && <p className="text-sm text-muted-foreground">No planned deliveries with an address yet. Set a date on a delivery to add it here.</p>}
        {groups.list.map((g) => <section key={g.name} className="rounded-xl border border-logo-violet/30 bg-card/60 p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">{g.name} <span className="text-xs text-muted-foreground">· {g.stops.length} stop{g.stops.length === 1 ? "" : "s"}</span></p>
            <Button size="sm" asChild><a href={googleUrl(g.stops.map((s) => s.addr)) + (g.stops.length > 1 ? "" : "")} target="_blank" rel="noreferrer"><MapPin className="mr-1 h-4 w-4" />Open in Google Maps</a></Button>
          </div>
          {g.stops.length > MAX_WAYPOINTS + 1 && <p className="mb-2 text-xs text-destructive">Google Maps takes up to {MAX_WAYPOINTS + 1} stops per link — the rest are listed below.</p>}
          <ol className="space-y-1.5">
            {g.stops.map((s, i) => <li key={s.ref + i} className="flex items-center gap-2 text-sm">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-logo-cyan/15 text-[10px] font-bold text-logo-cyan">{i + 1}</span>
              <span className="min-w-0 flex-1"><strong>{s.ref}</strong> · {s.who}<span className="block truncate text-xs text-muted-foreground">{s.addr}</span></span>
              <a className="rounded-full border border-border px-2 py-1 text-[10px] font-bold hover:bg-accent" href={wazeUrl(s.addr)} target="_blank" rel="noreferrer">Waze</a>
            </li>)}
          </ol>
        </section>)}
      </div>
    </DialogContent>
  </Dialog>;
}
