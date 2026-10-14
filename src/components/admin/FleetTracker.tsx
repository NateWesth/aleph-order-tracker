import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Fuel, Plus, Truck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const db = supabase as any;
type Vehicle = { id: string; name: string; registration: string | null; make_model: string | null; odometer: number; service_interval_km: number; last_service_odometer: number; next_service_date: string | null };
type Log = { id: string; vehicle_id: string; log_type: string; odometer: number | null; litres: number | null; cost: number | null; notes: string | null; created_at: string; route_id: string | null };
const R = (n: number | null) => n == null ? "—" : "R " + Number(n).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function FleetTracker({ routes = [], onClose }: { routes?: { id: string; name: string; route_date: string }[]; onClose: () => void }) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [err, setErr] = useState("");
  const [nv, setNv] = useState({ name: "", registration: "", make_model: "", odometer: "", service_interval_km: "15000" });
  const [log, setLog] = useState({ vehicle_id: "", log_type: "fuel", odometer: "", litres: "", cost: "", route_id: "", notes: "" });

  const load = useCallback(async () => {
    const [v, l] = await Promise.all([db.from("fleet_vehicles").select("*").eq("active", true).order("name"), db.from("fleet_logs").select("*").order("created_at", { ascending: false }).limit(30)]);
    setVehicles(v.data || []); setLogs(l.data || []);
    if (v.error) setErr(v.error.message);
  }, []);
  useEffect(() => { void load(); }, [load]);
  const num = (s: string) => s.trim() === "" ? null : Number(s);

  const addVehicle = async () => {
    if (!nv.name.trim()) return;
    const o = num(nv.odometer) || 0;
    const { error } = await db.from("fleet_vehicles").insert({ name: nv.name.trim(), registration: nv.registration || null, make_model: nv.make_model || null, odometer: o, last_service_odometer: o, service_interval_km: num(nv.service_interval_km) || 15000 });
    if (error) setErr(error.message); else { setNv({ name: "", registration: "", make_model: "", odometer: "", service_interval_km: "15000" }); void load(); }
  };
  const addLog = async () => {
    if (!log.vehicle_id) { setErr("Choose a vehicle"); return; }
    const { error } = await db.from("fleet_logs").insert({ vehicle_id: log.vehicle_id, log_type: log.log_type, odometer: num(log.odometer), litres: num(log.litres), cost: num(log.cost), route_id: log.route_id || null, notes: log.notes || null });
    if (error) setErr(error.message); else { setErr(""); setLog({ ...log, odometer: "", litres: "", cost: "", notes: "" }); void load(); }
  };
  const vName = (id: string) => vehicles.find((v) => v.id === id)?.name || "Vehicle";

  return <Dialog open onOpenChange={(o) => !o && onClose()}>
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><Truck className="h-5 w-5 text-logo-cyan" />Fleet & fuel</DialogTitle>
        <DialogDescription>Log fuel slips, odometer readings and services. Vehicles within 1,000 km of a service are flagged.</DialogDescription>
      </DialogHeader>
      <div className="max-h-[65vh] space-y-4 overflow-y-auto">
        {err && <p className="text-sm text-destructive">{err}</p>}
        <div className="grid gap-2 sm:grid-cols-2">
          {vehicles.map((v) => {
            const left = v.last_service_odometer + v.service_interval_km - v.odometer;
            const dateDue = v.next_service_date && new Date(v.next_service_date) <= new Date(Date.now() + 14 * 864e5);
            const due = left <= 1000 || dateDue;
            return <div key={v.id} className={"rounded-xl border p-3 " + (due ? "border-amber-500/60 bg-amber-500/5" : "border-logo-violet/30 bg-card/60")}>
              <p className="font-semibold">{v.name} <span className="text-xs text-muted-foreground">{v.registration}</span></p>
              <p className="text-xs text-muted-foreground">{v.make_model} · {Number(v.odometer).toLocaleString("en-ZA")} km</p>
              <p className={"mt-1 text-xs font-semibold " + (due ? "text-amber-500" : "text-muted-foreground")}>{due && <AlertTriangle className="mr-1 inline h-3 w-3" />}{left <= 0 ? `Service overdue by ${Math.abs(left).toLocaleString("en-ZA")} km` : `Service in ${left.toLocaleString("en-ZA")} km`}</p>
            </div>;
          })}
          {!vehicles.length && <p className="text-sm text-muted-foreground">No vehicles yet — add your first bakkie or truck below.</p>}
        </div>

        <section className="rounded-xl border border-logo-cyan/30 p-3">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><Fuel className="h-4 w-4 text-logo-cyan" />Quick log</p>
          <div className="grid gap-2 sm:grid-cols-3">
            <select value={log.vehicle_id} onChange={(e) => setLog({ ...log, vehicle_id: e.target.value })} className="h-9 rounded-md border border-border bg-background px-2 text-sm"><option value="">Vehicle…</option>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select>
            <select value={log.log_type} onChange={(e) => setLog({ ...log, log_type: e.target.value })} className="h-9 rounded-md border border-border bg-background px-2 text-sm"><option value="fuel">Fuel slip</option><option value="odometer">Odometer reading</option><option value="service">Service done</option><option value="incident">Incident</option></select>
            <select value={log.route_id} onChange={(e) => setLog({ ...log, route_id: e.target.value })} className="h-9 rounded-md border border-border bg-background px-2 text-sm"><option value="">No dispatch run</option>{routes.map((r) => <option key={r.id} value={r.id}>{r.name} · {r.route_date}</option>)}</select>
            <Input inputMode="decimal" placeholder="Odometer (km)" value={log.odometer} onChange={(e) => setLog({ ...log, odometer: e.target.value })} />
            {log.log_type === "fuel" && <Input inputMode="decimal" placeholder="Litres" value={log.litres} onChange={(e) => setLog({ ...log, litres: e.target.value })} />}
            <Input inputMode="decimal" placeholder="Cost (R)" value={log.cost} onChange={(e) => setLog({ ...log, cost: e.target.value })} />
            <Input className="sm:col-span-3" placeholder="Notes" value={log.notes} onChange={(e) => setLog({ ...log, notes: e.target.value })} />
          </div>
          <Button size="sm" className="mt-2" onClick={() => void addLog()}>Save log</Button>
        </section>

        <section>
          <p className="mb-1 text-sm font-semibold">Recent logs</p>
          <div className="space-y-1">{logs.map((l) => <div key={l.id} className="flex items-center gap-2 rounded-lg border border-border/60 px-2 py-1.5 text-xs">
            <span className="font-semibold">{vName(l.vehicle_id)}</span><span className="rounded bg-logo-violet/15 px-1 font-bold uppercase text-logo-violet">{l.log_type}</span>
            <span className="text-muted-foreground">{l.odometer != null && `${Number(l.odometer).toLocaleString("en-ZA")} km`}{l.litres != null && ` · ${l.litres} L`}{l.notes && ` · ${l.notes}`}</span>
            <span className="ml-auto">{R(l.cost)}</span><span className="text-muted-foreground">{new Date(l.created_at).toLocaleDateString("en-ZA")}</span>
          </div>)}{!logs.length && <p className="text-xs text-muted-foreground">Nothing logged yet.</p>}</div>
        </section>

        <section className="rounded-xl border border-border/60 p-3">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><Plus className="h-4 w-4" />Add vehicle</p>
          <div className="grid gap-2 sm:grid-cols-3">
            <Input placeholder="Name (e.g. Bakkie 1)" value={nv.name} onChange={(e) => setNv({ ...nv, name: e.target.value })} />
            <Input placeholder="Registration" value={nv.registration} onChange={(e) => setNv({ ...nv, registration: e.target.value })} />
            <Input placeholder="Make / model" value={nv.make_model} onChange={(e) => setNv({ ...nv, make_model: e.target.value })} />
            <Input inputMode="decimal" placeholder="Current km" value={nv.odometer} onChange={(e) => setNv({ ...nv, odometer: e.target.value })} />
            <Input inputMode="decimal" placeholder="Service every (km)" value={nv.service_interval_km} onChange={(e) => setNv({ ...nv, service_interval_km: e.target.value })} />
            <Button onClick={() => void addVehicle()}>Add vehicle</Button>
          </div>
        </section>
      </div>
    </DialogContent>
  </Dialog>;
}
