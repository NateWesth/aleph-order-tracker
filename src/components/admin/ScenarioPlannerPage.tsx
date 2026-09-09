import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, FlaskConical, RefreshCw, RotateCcw, Truck, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLiveData } from "@/hooks/useLiveData";
import { readAllRows } from "@/lib/readAllRows";
import { parsePOCache, openPO, vendorKey, sastToday, simulateSupplierDelay, type ScenarioOrder, type ScenarioLink } from "@/lib/scenarioPlanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function ScenarioPlannerPage({ onNavigate }: { onNavigate: (view: string) => void }) {
  const { user } = useAuth();
  const [vendor, setVendor] = useState("");
  const [delayDays, setDelayDays] = useState(7);
  const [handlingDays, setHandlingDays] = useState(0);
  const [assumedArrival, setAssumedArrival] = useState("");
  const [commitments, setCommitments] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [page, setPage] = useState(0);
  const query = useQuery({
    queryKey: ["supplier-delay-snapshot", user?.id],
    enabled: !!user?.id,
    queryFn: async ({ signal }) => {
      const [cache, orders, links, collectionStates] = await Promise.all([
        supabase.from("po_tracking_cache").select("payload,fetched_at")
          .eq("id", "00000000-0000-0000-0000-000000000003").abortSignal(signal).maybeSingle(),
        readAllRows((from, to) => supabase.from("orders")
          .select("id,order_number,status,completed_date,company_id,urgency,fulfillment_scheduled_for,companies(name)")
          .is("completed_date", null).order("id").range(from, to).abortSignal(signal), signal),
        readAllRows<ScenarioLink>((from, to) => supabase.from("order_purchase_orders")
          .select("order_id,purchase_order_number").order("id").range(from, to).abortSignal(signal), signal),
        readAllRows((from, to) => supabase.from("po_collection_state")
          .select("purchase_order_id,status,completed_at").order("purchase_order_id").range(from,to).abortSignal(signal), signal),
      ]);
      if (cache.error) throw new Error(cache.error.message);
      if (!cache.data) throw new Error("No PO snapshot is available yet. Open PO Tracking to check the source.");
      const collected = new Set(collectionStates.filter(state => state.status === "collected" || !!state.completed_at).map(state => state.purchase_order_id));
      return {
        pos: parsePOCache(cache.data.payload).map(po => collected.has(po.purchaseOrderId)
          ? { ...po, status: "closed" } : po),
        orders: orders.map(order => ({ ...order, customer: order.companies?.name || "Customer not linked" })) as ScenarioOrder[],
        links, fetchedAt: cache.data.fetched_at,
      };
    },
    staleTime: 60_000,
  });
  useLiveData(["po_tracking_cache", "orders", "order_purchase_orders", "po_collection_state"], async () => { await query.refetch(); },
    { enabled: !!user?.id, channelName: "scenario-snapshot" });
  const suppliers = useMemo(() => [...new Map((query.data?.pos || []).filter(openPO)
    .map(po => [vendorKey(po), po.vendorName])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [query.data]);
  const effectiveVendor = suppliers.some(([id]) => id === vendor) ? vendor : suppliers[0]?.[0] || "";
  const result = useMemo(() => query.data ? simulateSupplierDelay(query.data.pos, query.data.orders, query.data.links, {
    vendor: effectiveVendor, delayDays, handlingDays, today: sastToday(), assumedArrival, commitmentOverrides: commitments,
  }) : { results: [], selected: [], unlinked: [] }, [query.data, effectiveVendor, delayDays, handlingDays, assumedArrival, commitments]);
  const selected = result.results.find(row => row.order.id === selectedId);
  const filtered = result.results.filter(row => (row.order.order_number + " " + row.order.customer).toLowerCase().includes(filter.toLowerCase()));
  const currentPage = Math.min(page, Math.max(0, Math.ceil(filtered.length / 24) - 1));
  const stale = query.data && Date.now() - new Date(query.data.fetchedAt).getTime() > 86400000;
  const reset = () => { setDelayDays(7); setHandlingDays(0); setAssumedArrival(""); setCommitments({}); setFilter(""); setPage(0); };
  const openOrder = (id: string) => {
    window.sessionStorage.setItem("aleph:open-order", id);
    setDetailOpen(false);
    onNavigate("orders");
  };
  return <div className="scenario-workspace space-y-5 pb-8">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div><p className="text-xs font-bold uppercase tracking-widest text-primary">Planning studio</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">What if a supplier is late?</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Explore the impact on linked orders before changing your plans.</p></div>
      <Badge variant="secondary" className="w-fit gap-2 px-3 py-2"><FlaskConical className="h-4 w-4" />Simulation only</Badge>
    </header>
    {query.isError && <div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
      <p className="font-semibold">Snapshot could not load</p><p className="mt-1 text-sm">{query.error.message}</p>
      <Button className="mt-3" variant="outline" disabled={query.isFetching} onClick={() => query.refetch()}>Retry</Button>
    </div>}
    <div className="grid items-start gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="space-y-5 rounded-2xl border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between"><h2 className="text-base font-semibold">Scenario inputs</h2><Button size="icon" variant="ghost" aria-label="Reset scenario" onClick={reset}><RotateCcw className="h-4 w-4" /></Button></div>
        <div className="space-y-2"><Label htmlFor="scenario-supplier">Supplier</Label>
          <Select value={effectiveVendor} onValueChange={value => { setVendor(value); setPage(0); setAssumedArrival(""); }}>
            <SelectTrigger id="scenario-supplier"><SelectValue placeholder={query.isPending ? "Loading suppliers…" : "No open supplier POs"} /></SelectTrigger>
            <SelectContent>{suppliers.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}</SelectContent>
          </Select></div>
        <div className="space-y-3"><Label htmlFor="scenario-delay">Supplier delay · {delayDays} calendar days</Label>
          <input id="scenario-delay" type="range" min="0" max="90" value={delayDays} onChange={e => setDelayDays(Number(e.target.value))} className="w-full accent-primary" />
          <div className="grid grid-cols-4 gap-2">{[0, 3, 7, 14].map(days => <Button key={days} variant={delayDays === days ? "default" : "outline"} size="sm" onClick={() => setDelayDays(days)}>{days}d</Button>)}</div>
        </div>
        <details className="border-t pt-3"><summary className="cursor-pointer py-2 text-sm font-semibold">Advanced assumptions{handlingDays || assumedArrival ? " · active" : ""}</summary><div className="mt-3 space-y-4">
        <div className="space-y-2"><Label htmlFor="scenario-handling">Handling time after stock arrives</Label><Input id="scenario-handling" type="number" min="0" max="30" value={handlingDays} onChange={e => setHandlingDays(Math.max(0, Math.min(30, Math.floor(Number(e.target.value) || 0))))} /><p className="text-xs text-muted-foreground">Calendar days for preparation and dispatch.</p></div>
        <div className="space-y-2"><Label htmlFor="scenario-arrival">Assumed arrival for missing / overdue dates</Label><Input id="scenario-arrival" type="date" min={sastToday()} value={assumedArrival} onChange={e => setAssumedArrival(e.target.value)} /><p className="text-xs text-muted-foreground">Optional. Applies only to this supplier, before adding the delay.</p></div>
        </div></details>
        <p className="text-xs leading-relaxed text-muted-foreground">Uses the cached PO snapshot. Simulation only: no Zoho calls or changes to live orders.</p>
      </aside>
      <main className="min-w-0 space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-live="polite">
          {[["Linked orders", result.results.length], ["Target dates at risk", result.results.filter(r => (r.lateDays || 0) > 0).length],
            ["Need arrival confirmation", result.results.filter(r => r.unknownDates > 0).length], ["POs without open order links", result.unlinked.length]].map(([label, value]) =>
            <div key={label} className="rounded-2xl border bg-card p-4"><p className="text-2xl font-bold tabular-nums">{query.isPending ? "—" : value}</p><p className="mt-1 text-xs text-muted-foreground">{label}</p></div>)}
        </div>
        {stale && <p className="flex items-center gap-2 rounded-xl bg-amber-500/10 p-3 text-sm"><AlertTriangle className="h-4 w-4 shrink-0" />The PO snapshot is over 24 hours old. Confirm arrival dates before making commitments.</p>}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Input aria-label="Filter affected orders" placeholder="Find order or customer…" value={filter} onChange={e => { setFilter(e.target.value); setPage(0); }} className="sm:max-w-xs" />
          <Button variant="outline" disabled={query.isFetching} onClick={() => query.refetch()}><RefreshCw className={"mr-2 h-4 w-4 " + (query.isFetching ? "animate-spin" : "")} />Refresh snapshot</Button>
        </div>
        {query.isPending ? <div role="status" className="rounded-2xl border bg-card p-12 text-center text-muted-foreground">Loading your PO and order snapshot…</div> :
          !filtered.length ? <div className="rounded-2xl border border-dashed p-10 text-center"><Truck className="mx-auto mb-3 h-8 w-8 text-primary" /><h2 className="font-semibold">{suppliers.length ? "No linked open orders match" : "No open supplier POs in the snapshot"}</h2><p className="mt-2 text-sm text-muted-foreground">{result.unlinked.length ? "Unlinked POs are shown below; order impact cannot be inferred without a link." : "Select another supplier or check PO Tracking."}</p></div> :
          <div className="space-y-3">{filtered.slice(currentPage * 24, currentPage * 24 + 24).map(row =>
            <button type="button" key={row.order.id} onClick={() => { setSelectedId(row.order.id); setDetailOpen(true); }} className="scenario-result group w-full rounded-2xl border bg-card p-4 text-left shadow-sm transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-bold">{row.order.order_number}</p><p className="text-sm text-muted-foreground">{row.order.customer}</p></div>
                <Badge variant={row.unknownDates ? "outline" : (row.lateDays || 0) > 0 ? "destructive" : "secondary"}>{row.unknownDates ? "Confirm dates" : row.lateDays ? row.lateDays + "d past target" : row.commitment ? "Within target" : "No target date"}</Badge></div>
              <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-xl bg-muted/40 p-3"><div><p className="text-[10px] uppercase text-muted-foreground">Baseline ready</p><p className="mt-1 text-sm font-semibold">{row.baseline || "Unknown"}</p></div><ArrowRight className="h-4 w-4 text-primary" /><div><p className="text-[10px] uppercase text-muted-foreground">Scenario ready</p><p className="mt-1 text-sm font-semibold">{row.projected || "Unknown"}</p></div></div>
              <p className="mt-3 text-xs text-muted-foreground">{row.affectedPOs.length} supplier PO(s) · {row.shiftDays === null ? "Impact needs confirmation" : row.shiftDays + " calendar days later"}{row.assumedDates ? " · Includes assumed arrivals" : ""}</p>
            </button>)}</div>}
        {filtered.length > 24 && <div className="flex items-center justify-between"><Button variant="outline" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</Button><span className="text-sm">{currentPage + 1} / {Math.ceil(filtered.length / 24)}</span><Button variant="outline" disabled={(currentPage + 1) * 24 >= filtered.length} onClick={() => setPage(currentPage + 1)}>Next</Button></div>}
        {result.unlinked.length > 0 && <details className="rounded-2xl border p-4"><summary className="cursor-pointer font-semibold">{result.unlinked.length} PO(s) cannot be traced to an open order</summary><p className="my-2 text-xs text-muted-foreground">These are excluded from order-impact totals.</p>{result.unlinked.map(po => <p key={po.purchaseOrderId} className="py-1 text-sm">{po.purchaseOrderNumber} · {po.expectedDeliveryDate || "Arrival not set"}</p>)}</details>}
        {query.data && <p className="text-xs text-muted-foreground">PO snapshot: {new Date(query.data.fetchedAt).toLocaleString("en-ZA")} · Latest arrival across linked open POs + handling time. Scheduled fulfillment is used as the target; it is not a confirmed customer promise.</p>}
      </main>
    </div>
    <Dialog open={detailOpen && !!selected} onOpenChange={setDetailOpen}><DialogContent className="max-h-[90dvh] w-[calc(100%-24px)] max-w-xl overflow-y-auto rounded-2xl">
      <DialogHeader><DialogTitle>{selected?.order.order_number} · Scenario detail</DialogTitle><DialogDescription>{selected?.order.customer}</DialogDescription></DialogHeader>
      {selected && <><div className="space-y-2">{selected.affectedPOs.map(po => <div key={po.purchaseOrderId} className="rounded-xl bg-muted/40 p-3"><p className="font-semibold">{po.purchaseOrderNumber}</p><p className="text-xs text-muted-foreground">Recorded arrival: {po.expectedDeliveryDate || "Missing"}</p></div>)}</div>
        <div className="space-y-2"><Label htmlFor="scenario-target">Test a different target date</Label><Input id="scenario-target" type="date" value={commitments[selected.order.id] || ""} onChange={e => setCommitments(current => ({ ...current, [selected.order.id]: e.target.value }))} /><p className="text-xs text-muted-foreground">Stored only while this planner is open. Clear to use the scheduled fulfillment date.</p></div>
        <dl className="grid grid-cols-2 gap-3 text-sm"><dt className="text-muted-foreground">Target</dt><dd>{selected.commitment || "Not set"} ({selected.commitmentSource})</dd><dt className="text-muted-foreground">Already late in baseline</dt><dd>{selected.baselineLateDays === null ? "Unknown" : selected.baselineLateDays + " days"}</dd><dt className="text-muted-foreground">Late in scenario</dt><dd>{selected.lateDays === null ? "Unknown" : selected.lateDays + " days"}</dd></dl>
        <p className="rounded-xl bg-primary/5 p-3 text-sm">{selected.unknownDates ? "Confirm missing or overdue arrival dates before comparing commitments." : selected.shiftDays === 0 ? "Other PO dependencies or existing lead time absorb this supplier delay." : "Consider confirming the supplier ETA, staging available items, or discussing a revised delivery date with the customer."}</p>
        <Button onClick={() => openOrder(selected.order.id)}>Open order details<ArrowRight className="ml-2 h-4 w-4" /></Button>
      </>}
    </DialogContent></Dialog>
  </div>;
}
