import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ChevronDown,
  ChevronRight,
  Search,
  Truck,
  Package,
  FileText,
  Mail,
} from "lucide-react";
import { format } from "date-fns";
import { useIsMobile } from "@/hooks/use-mobile";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { OrderWithCompany } from "@/components/orders/types/orderTypes";
import OrderDetailsDialog from "@/components/orders/components/OrderDetailsDialog";
import PageHeader from "@/components/ui/PageHeader";
import { getPurchaseOrderLineDisplayName, getPurchaseOrderLineSecondaryName } from "@/lib/itemDisplay";
import { cn } from "@/lib/utils";

interface POLine {
  sku: string;
  name: string;
  description: string;
  quantity: number;
  quantityReceived: number;
  quantityBilled: number;
  outstanding: number;
  rate: number;
}

interface ZohoPO {
  purchaseOrderId: string;
  purchaseOrderNumber: string;
  vendorId: string;
  vendorName: string;
  vendorEmail: string;
  date: string;
  expectedDeliveryDate: string | null;
  status: string;
  receivedStatus: string;
  billedStatus: string;
  total: number;
  outstandingValue: number;
  lines: POLine[];
}

interface LinkedOrderRef {
  orderId: string;
  orderNumber: string;
  companyName: string;
  status: string | null;
  urgency: string | null;
  createdAt: string;
  description: string | null;
  companyId: string | null;
}

interface LocalCollectionProgress {
  status: string;
  collectionMethod: "pickup" | "supplier-delivery";
  isUrgent: boolean;
  lines: Record<string, number>;
}

const poLineKey = (line: Pick<POLine, "sku" | "name" | "description">) => {
  const sku = String(line.sku || "").trim().toLowerCase();
  if (sku) return `sku:${sku}`;
  return `nm:${String(line.name || "").trim().toLowerCase()}|${String(line.description || "").trim().toLowerCase()}`;
};

const money = (n: number) =>
  `R${n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function POTrackingPage() {
  const [pos, setPos] = useState<ZohoPO[]>([]);
  const [linkedOrders, setLinkedOrders] = useState<Record<string, LinkedOrderRef[]>>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [openVendors, setOpenVendors] = useState<Set<string>>(new Set());
  const [selectedVendor, setSelectedVendor] = useState<string | null>(null);
  const [openPOs, setOpenPOs] = useState<Set<string>>(new Set());
  const [selectedOrder, setSelectedOrder] = useState<OrderWithCompany | null>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [collectionProgress, setCollectionProgress] = useState<Record<string, LocalCollectionProgress>>({});
  const { toast } = useToast();
  const isMobile = useIsMobile();

  useEffect(() => {
    fetchData();
  }, []);

  // Zoho webhooks update the shared cache once; Realtime delivers that same
  // snapshot to every open app without any browser polling or repeated API read.
  useEffect(() => {
    let localRefreshTimer: number | undefined;
    let fulfillmentRefreshTimer: number | undefined;
    const queueFulfillmentRefresh = () => {
      window.clearTimeout(fulfillmentRefreshTimer);
      fulfillmentRefreshTimer = window.setTimeout(() => void fetchCollectionProgress(), 500);
    };
    const channel = supabase
      .channel("po-tracking-event-cache")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "po_tracking_cache", filter: "id=eq.00000000-0000-0000-0000-000000000003" },
        (change) => {
          const next = change.new as { payload?: unknown; fetched_at?: string };
          if (!next?.payload) return;
          setPos(next.payload as ZohoPO[]);
          setFetchedAt(next.fetched_at || new Date().toISOString());
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_purchase_orders" },
        () => {
          window.clearTimeout(localRefreshTimer);
          localRefreshTimer = window.setTimeout(() => void fetchLinkedOrders(), 500);
        },
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "po_collection_state" }, queueFulfillmentRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "po_collection_events" }, queueFulfillmentRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "po_collection_event_lines" }, queueFulfillmentRefresh)
      .subscribe();

    return () => {
      window.clearTimeout(localRefreshTimer);
      window.clearTimeout(fulfillmentRefreshTimer);
      void supabase.removeChannel(channel);
    };
  }, []);


  const fetchLinkedOrders = async () => {
    const { data: links, error: linksError } = await supabase
      .from("order_purchase_orders")
      .select("order_id, purchase_order_number");

    if (linksError) throw linksError;

    if (!links?.length) {
      setLinkedOrders({});
      return;
    }

    const orderIds = [...new Set(links.map((l) => l.order_id))];
    const { data: ordersData, error: ordersError } = await supabase
      .from("orders")
      .select("id, order_number, status, urgency, created_at, company_id, description")
      .in("id", orderIds);
    if (ordersError) throw ordersError;

    const companyIds = [...new Set((ordersData || []).map((o) => o.company_id).filter(Boolean))] as string[];
    let companyMap = new Map<string, string>();
    if (companyIds.length) {
      const { data: companies, error: companiesError } = await supabase.from("companies").select("id, name").in("id", companyIds);
      if (companiesError) throw companiesError;
      companyMap = new Map((companies || []).map((c) => [c.id, c.name]));
    }

    // Index once rather than scanning the complete order list for every PO link.
    const orderMap = new Map((ordersData || []).map((order) => [order.id, order]));
    const map: Record<string, LinkedOrderRef[]> = {};
    links.forEach((link) => {
      const order = orderMap.get(link.order_id);
      if (!order) return;
      const key = (link.purchase_order_number || "").trim().toUpperCase();
      if (!key) return;
      if (!map[key]) map[key] = [];
      if (map[key].some((o) => o.orderId === order.id)) return;
      map[key].push({
        orderId: order.id,
        orderNumber: order.order_number,
        companyName: order.company_id ? companyMap.get(order.company_id) || "Unknown" : "No Client",
        status: order.status,
        urgency: order.urgency,
        createdAt: order.created_at,
        description: order.description,
        companyId: order.company_id,
      });
    });
    setLinkedOrders(map);
  };

  const fetchCollectionProgress = async () => {
    const [{ data: states, error: statesError }, { data: events, error: eventsError }] = await Promise.all([
      supabase.from("po_collection_state").select("purchase_order_id, status, collection_method, is_urgent"),
      supabase.from("po_collection_events").select("id, purchase_order_id"),
    ]);
    if (statesError) throw statesError;
    if (eventsError) throw eventsError;

    const eventToPO = new Map((events || []).map((event) => [event.id, event.purchase_order_id]));
    const eventIds = [...eventToPO.keys()];
    const { data: lines, error: linesError } = eventIds.length
      ? await supabase.from("po_collection_event_lines").select("event_id, line_key, quantity_collected").in("event_id", eventIds)
      : ({ data: [], error: null } as any);
    if (linesError) throw linesError;

    const next: Record<string, LocalCollectionProgress> = {};
    (states || []).forEach((state) => {
      next[state.purchase_order_id] = {
        status: state.status,
        collectionMethod: state.collection_method === "supplier-delivery" ? "supplier-delivery" : "pickup",
        isUrgent: Boolean(state.is_urgent),
        lines: {},
      };
    });
    (lines || []).forEach((line) => {
      const poId = eventToPO.get(line.event_id);
      if (!poId) return;
      const progress = next[poId] || { status: "pending", collectionMethod: "pickup", isUrgent: false, lines: {} };
      progress.lines[line.line_key] = (progress.lines[line.line_key] || 0) + Number(line.quantity_collected || 0);
      next[poId] = progress;
    });
    setCollectionProgress(next);
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [{ data: cached, error: cacheError }] = await Promise.all([
        supabase
          .from("po_tracking_cache")
          .select("payload, fetched_at")
          .eq("id", "00000000-0000-0000-0000-000000000003")
          .maybeSingle(),
        fetchLinkedOrders(),
        fetchCollectionProgress(),
      ]);

      if (cacheError) throw cacheError;

      // Only a brand-new installation with no snapshot performs one bootstrap
      // request. Subsequent loads are database-only and webhook-driven.
      let payload = cached;
      if (!payload?.payload) {
        const { data, error } = await supabase.functions.invoke("po-tracking-data", { body: { force: false } });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        payload = { payload: data?.purchaseOrders || [], fetched_at: data?.fetchedAt || new Date().toISOString() } as typeof cached;
      }

      const purchaseOrders = (payload?.payload || []) as unknown as ZohoPO[];
      setPos(purchaseOrders);
      setFetchedAt(payload?.fetched_at || null);
      // Large accounts previously mounted every vendor, PO and line on first paint.
      // Expanding on demand keeps the initial web and mobile render fast.
      setOpenVendors(new Set());
    } catch (error: any) {
      console.error("Error fetching PO tracking data:", error);
      toast({
        title: "Error",
        description: error?.message || "Failed to load the shared purchase-order snapshot",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const displayPos = useMemo(
    () => pos.map((po) => {
      const local = collectionProgress[po.purchaseOrderId];
      if (!local) return po;
      return {
        ...po,
        lines: po.lines.map((line) => ({
          ...line,
          quantityReceived: Math.min(
            line.quantity,
            Math.max(Number(line.quantityReceived || 0), Number(local.lines[poLineKey(line)] || 0)),
          ),
        })),
      };
    }),
    [pos, collectionProgress],
  );

  const vendorGroups = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    const matches = (po: ZohoPO) => {
      if (!term) return true;
      return (
        po.purchaseOrderNumber.toLowerCase().includes(term) ||
        po.vendorName.toLowerCase().includes(term) ||
        po.lines.some(
          (l) =>
            l.sku.toLowerCase().includes(term) ||
            l.name.toLowerCase().includes(term) ||
            l.description.toLowerCase().includes(term)
        ) ||
        (linkedOrders[po.purchaseOrderNumber.trim().toUpperCase()] || []).some((o) =>
          o.orderNumber.toLowerCase().includes(term) || o.companyName.toLowerCase().includes(term)
        )
      );
    };

    const grouped = new Map<string, ZohoPO[]>();
    displayPos.filter(matches).forEach((po) => {
      const key = po.vendorName || "Unknown supplier";
      grouped.set(key, [...(grouped.get(key) || []), po]);
    });

    return [...grouped.entries()]
      .map(([vendorName, vendorPOs]) => ({
        vendorName,
        vendorEmail: vendorPOs.find((p) => p.vendorEmail)?.vendorEmail || "",
        pos: vendorPOs.sort((a, b) => (b.date || "").localeCompare(a.date || "")),
        outstandingUnits: vendorPOs.reduce(
          (sum, p) => sum + p.lines.reduce((s, l) => s + l.outstanding, 0),
          0
        ),
        outstandingValue: vendorPOs.reduce((sum, p) => sum + p.outstandingValue, 0),
      }))
      .sort((a, b) => b.outstandingValue - a.outstandingValue);
  }, [displayPos, searchTerm, linkedOrders]);

  useEffect(() => {
    if (vendorGroups.length === 0) {
      setSelectedVendor(null);
      return;
    }

    const nextVendor = vendorGroups.some((group) => group.vendorName === selectedVendor)
      ? selectedVendor!
      : vendorGroups[0].vendorName;

    setSelectedVendor(nextVendor);
    setOpenVendors(new Set([nextVendor]));
  }, [vendorGroups, selectedVendor]);

  const toggle = (set: Set<string>, key: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setter(next);
  };

  const openOrder = (ref: LinkedOrderRef) => {
    setSelectedOrder({
      id: ref.orderId,
      order_number: ref.orderNumber,
      description: ref.description,
      status: ref.status,
      urgency: ref.urgency,
      company_id: ref.companyId,
      created_at: ref.createdAt,
      companyName: ref.companyName,
      supplier_id: null,
      purchase_order_number: null,
      supplierName: null,
    } as OrderWithCompany);
    setDetailsDialogOpen(true);
  };

  const receiveBadge = (po: ZohoPO) => {
    const received = po.lines.reduce((s, l) => s + l.quantityReceived, 0);
    const ordered = po.lines.reduce((s, l) => s + l.quantity, 0);
    if (received <= 0) return <Badge variant="outline">Awaiting stock</Badge>;
    if (received < ordered) return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300">Partially received</Badge>;
    return <Badge className="bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-300">Received, unbilled</Badge>;
  };

  const totalOutstandingUnits = displayPos.reduce(
    (sum, p) => sum + p.lines.reduce((s, l) => s + l.outstanding, 0),
    0
  );
  const totalOutstandingValue = displayPos.reduce((sum, p) => sum + p.outstandingValue, 0);

  if (loading) return <PageSkeleton variant="table" />;

  return (
    <div className="aleph-page-workspace aleph-po-workspace space-y-5">
      <PageHeader
        title="Outstanding Purchase Orders"
        icon={FileText}
        description={
          fetchedAt
            ? `Live webhook cache · updated ${format(new Date(fetchedAt), "dd MMM yyyy HH:mm")} · POs disappear once a vendor bill is raised`
            : "Live webhook cache · POs appear when Zoho sends a document event"
        }
        stats={[
          { label: "suppliers", value: vendorGroups.length, icon: Truck },
          { label: "POs", value: pos.length, icon: FileText },
          { label: `units · ${money(totalOutstandingValue)}`, value: totalOutstandingUnits, icon: Package },
        ]}
        toolbar={
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by supplier, PO number, SKU, item, or linked order..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
        }
      />


      {vendorGroups.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Truck className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-lg font-medium text-muted-foreground">No outstanding purchase orders</p>
            <p className="text-sm text-muted-foreground mt-1">
              Every Zoho purchase order has been fully billed
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="po-tracking-workbench grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="po-supplier-navigator rounded-[24px] border border-border/60 bg-card/80 p-2 shadow-sm xl:sticky xl:top-4 xl:self-start">
            <div className="px-3 pb-2 pt-2">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">Supplier queue</p>
              <p className="mt-1 text-xs text-muted-foreground">Select a supplier to focus its outstanding POs.</p>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 xl:max-h-[calc(100dvh-19rem)] xl:flex-col xl:overflow-y-auto xl:overflow-x-hidden">
              {vendorGroups.map((group) => {
                const active = selectedVendor === group.vendorName;
                return (
                  <button
                    key={group.vendorName}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setSelectedVendor(group.vendorName);
                      setOpenVendors(new Set([group.vendorName]));
                    }}
                    className={cn(
                      "min-w-[220px] rounded-2xl border p-3 text-left transition-all xl:min-w-0",
                      active
                        ? "border-primary/30 bg-primary/10 shadow-[0_16px_34px_-26px_hsl(var(--primary))]"
                        : "border-transparent bg-muted/35 hover:border-primary/15 hover:bg-muted/65",
                    )}
                  >
                    <div className="flex items-start gap-2.5">
                      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", active ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground")}>
                        <Truck className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-foreground">{group.vendorName}</span>
                        <span className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span>{group.pos.length} PO{group.pos.length !== 1 ? "s" : ""}</span>
                          <span>·</span>
                          <span>{group.outstandingUnits} units</span>
                        </span>
                        <span className="mt-1 block text-xs font-black text-primary">{money(group.outstandingValue)}</span>
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="min-w-0 space-y-3">
          {vendorGroups.filter((group) => group.vendorName === selectedVendor).map((group) => (
            <Card key={group.vendorName} className="overflow-hidden border-2 hover:border-primary/25 transition-colors">
              <Collapsible
                open={openVendors.has(group.vendorName)}
                onOpenChange={() => toggle(openVendors, group.vendorName, setOpenVendors)}
              >
                <CollapsibleTrigger className="w-full">
                  <CardHeader className="py-3 px-4 hover:bg-muted/50 transition-colors cursor-pointer">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {openVendors.has(group.vendorName) ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                        )}
                        <Truck className="h-4 w-4 text-primary shrink-0" />
                        <span className="font-semibold truncate">{group.vendorName}</span>
                        {group.vendorEmail && !isMobile && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                            <Mail className="h-3 w-3" />
                            {group.vendorEmail}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="secondary">{group.pos.length} PO{group.pos.length !== 1 ? "s" : ""}</Badge>
                        <Badge variant="outline">{group.outstandingUnits} units</Badge>
                        {!isMobile && <Badge variant="outline">{money(group.outstandingValue)}</Badge>}
                      </div>
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>

                <CollapsibleContent>
                  <CardContent className="pt-0 pb-3 px-4 space-y-2">
                    {group.pos.map((po) => {
                      const links = linkedOrders[po.purchaseOrderNumber.trim().toUpperCase()] || [];
                      const isOpen = openPOs.has(po.purchaseOrderId);
                      const localProgress = collectionProgress[po.purchaseOrderId];
                      return (
                        <div key={po.purchaseOrderId} className="rounded-lg border bg-muted/20">
                          <button
                            className="w-full text-left p-3 flex flex-wrap items-center justify-between gap-2 hover:bg-muted/40 rounded-lg transition-colors"
                            onClick={() => toggle(openPOs, po.purchaseOrderId, setOpenPOs)}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                              <span className="font-mono font-medium">{po.purchaseOrderNumber}</span>
                              {po.date && (
                                <span className="text-xs text-muted-foreground">
                                  {format(new Date(po.date), "dd MMM yyyy")}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              {localProgress?.status === "collected" && <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-900 dark:text-emerald-200">{localProgress.collectionMethod === "supplier-delivery" ? "Supplier delivery received" : "Collected locally"}</Badge>}
                              {localProgress?.isUrgent && <Badge variant="destructive">Urgent</Badge>}
                              {receiveBadge(po)}
                              <Badge variant="outline">
                                {po.lines.reduce((s, l) => s + l.outstanding, 0)} pending
                              </Badge>
                              <span className="text-sm text-muted-foreground">{money(po.outstandingValue)}</span>
                            </div>
                          </button>

                          {isOpen && (
                            <div className="px-3 pb-3 space-y-3">
                              {links.length > 0 && (
                                <div className="flex flex-wrap items-center gap-2 text-xs">
                                  <span className="text-muted-foreground">Linked orders:</span>
                                  {links.map((l) => (
                                    <Badge
                                      key={l.orderId}
                                      variant="secondary"
                                      className="cursor-pointer hover:bg-primary/20"
                                      onClick={() => openOrder(l)}
                                    >
                                      {l.orderNumber} · {l.companyName}
                                    </Badge>
                                  ))}
                                </div>
                              )}

                              {isMobile ? (
                                <div className="space-y-2">
                                  {po.lines.map((line, idx) => (
                                    <div key={`${po.purchaseOrderId}-${idx}`} className="p-2 rounded-md bg-background border space-y-1">
                                      <p className="text-sm font-medium">{getPurchaseOrderLineDisplayName(line)}</p>
                                      {getPurchaseOrderLineSecondaryName(line) && <p className="text-xs text-muted-foreground">{getPurchaseOrderLineSecondaryName(line)}</p>}
                                      <p className="text-xs font-mono text-muted-foreground">{line.sku || "-"}</p>
                                      <div className="grid grid-cols-4 gap-1 text-xs">
                                        <div><span className="text-muted-foreground block">Ord</span>{line.quantity}</div>
                                        <div><span className="text-muted-foreground block">Rec</span>{line.quantityReceived}</div>
                                        <div><span className="text-muted-foreground block">Billed</span>{line.quantityBilled}</div>
                                        <div className="font-semibold"><span className="text-muted-foreground block font-normal">Pending</span>{line.outstanding}</div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>SKU</TableHead>
                                      <TableHead>Item</TableHead>
                                      <TableHead className="text-right">Ordered</TableHead>
                                      <TableHead className="text-right">Received</TableHead>
                                      <TableHead className="text-right">Billed</TableHead>
                                      <TableHead className="text-right">Pending</TableHead>
                                      <TableHead className="text-right">Value</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {po.lines.map((line, idx) => (
                                      <TableRow key={`${po.purchaseOrderId}-${idx}`}>
                                        <TableCell className="font-mono text-xs">{line.sku || "-"}</TableCell>
                                        <TableCell className="max-w-[320px] truncate">
                                          {getPurchaseOrderLineDisplayName(line)}
                                        </TableCell>
                                        <TableCell className="text-right">{line.quantity}</TableCell>
                                        <TableCell className="text-right">{line.quantityReceived}</TableCell>
                                        <TableCell className="text-right">{line.quantityBilled}</TableCell>
                                        <TableCell className="text-right font-semibold">{line.outstanding}</TableCell>
                                        <TableCell className="text-right text-muted-foreground">
                                          {money(line.outstanding * line.rate)}
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          ))}
          </section>
        </div>
      )}

      {selectedOrder && (
        <OrderDetailsDialog
          open={detailsDialogOpen}
          onOpenChange={setDetailsDialogOpen}
          order={selectedOrder}
          isAdmin={true}
          onSave={() => fetchData()}
        />
      )}
    </div>
  );
}
