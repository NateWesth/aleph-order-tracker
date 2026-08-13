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
  Loader2,
  RefreshCw,
  Mail,
} from "lucide-react";
import { format } from "date-fns";
import { useIsMobile } from "@/hooks/use-mobile";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { OrderWithCompany } from "@/components/orders/types/orderTypes";
import { useLiveData } from "@/hooks/useLiveData";
import OrderDetailsDialog from "@/components/orders/components/OrderDetailsDialog";
import PageHeader from "@/components/ui/PageHeader";

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

const money = (n: number) =>
  `R${n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function POTrackingPage() {
  const [pos, setPos] = useState<ZohoPO[]>([]);
  const [linkedOrders, setLinkedOrders] = useState<Record<string, LinkedOrderRef[]>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [openVendors, setOpenVendors] = useState<Set<string>>(new Set());
  const [openPOs, setOpenPOs] = useState<Set<string>>(new Set());
  const [selectedOrder, setSelectedOrder] = useState<OrderWithCompany | null>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [isCached, setIsCached] = useState(false);
  const { toast } = useToast();
  const isMobile = useIsMobile();

  useEffect(() => {
    fetchData();
  }, []);

  // Auto-refresh from Zoho every 10 minutes and whenever the tab regains focus
  useLiveData(["order_purchase_orders", "order_items"], () => fetchData(true), {
    fallbackIntervalMs: 5 * 60 * 1000,
    debounceMs: 1500,
  });


  const fetchLinkedOrders = async () => {
    const { data: links } = await supabase
      .from("order_purchase_orders")
      .select("order_id, purchase_order_number");

    if (!links?.length) {
      setLinkedOrders({});
      return;
    }

    const orderIds = [...new Set(links.map((l) => l.order_id))];
    const { data: ordersData } = await supabase
      .from("orders")
      .select("id, order_number, status, urgency, created_at, company_id, description")
      .in("id", orderIds);

    const companyIds = [...new Set((ordersData || []).map((o) => o.company_id).filter(Boolean))] as string[];
    let companyMap = new Map<string, string>();
    if (companyIds.length) {
      const { data: companies } = await supabase.from("companies").select("id, name").in("id", companyIds);
      companyMap = new Map((companies || []).map((c) => [c.id, c.name]));
    }

    const map: Record<string, LinkedOrderRef[]> = {};
    links.forEach((link) => {
      const order = ordersData?.find((o) => o.id === link.order_id);
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

  const fetchData = async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    try {
      const [{ data, error }] = await Promise.all([
        supabase.functions.invoke("po-tracking-data", {
          body: { force: isRefresh },
        }),
        fetchLinkedOrders(),
      ]);

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const purchaseOrders: ZohoPO[] = data?.purchaseOrders || [];
      setPos(purchaseOrders);
      setFetchedAt(data?.fetchedAt || null);
      setIsCached(Boolean(data?.cached));
      setOpenVendors(new Set(purchaseOrders.map((p) => p.vendorName)));
    } catch (error: any) {
      console.error("Error fetching PO tracking data:", error);
      toast({
        title: "Error",
        description: error?.message || "Failed to load purchase orders from Zoho",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

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
    pos.filter(matches).forEach((po) => {
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
  }, [pos, searchTerm, linkedOrders]);

  const toggle = (set: Set<string>, key: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    next.has(key) ? next.delete(key) : next.add(key);
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

  const totalOutstandingUnits = pos.reduce(
    (sum, p) => sum + p.lines.reduce((s, l) => s + l.outstanding, 0),
    0
  );
  const totalOutstandingValue = pos.reduce((sum, p) => sum + p.outstandingValue, 0);

  if (loading) return <PageSkeleton variant="table" />;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Outstanding Purchase Orders"
        icon={FileText}
        description={
          fetchedAt
            ? `${isCached ? "Cached" : "Live from Zoho"} · updated ${format(new Date(fetchedAt), "dd MMM yyyy HH:mm")} · auto-updates every 5 minutes · POs disappear once a vendor bill is raised`
            : "Live from Zoho · POs disappear once a vendor bill is raised"
        }
        stats={[
          { label: "suppliers", value: vendorGroups.length, icon: Truck },
          { label: "POs", value: pos.length, icon: FileText },
          { label: `units · ${money(totalOutstandingValue)}`, value: totalOutstandingUnits, icon: Package },
          ...(refreshing ? [{ label: "Updating", value: "", icon: Loader2 }] : []),
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
        <div className="space-y-3">
          {vendorGroups.map((group) => (
            <Card key={group.vendorName} className="overflow-hidden">
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
                                      <p className="text-sm font-medium">{line.name || line.description}</p>
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
                                          {line.name || line.description}
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
        </div>
      )}

      {selectedOrder && (
        <OrderDetailsDialog
          open={detailsDialogOpen}
          onOpenChange={setDetailsDialogOpen}
          order={selectedOrder}
          isAdmin={true}
          onSave={() => fetchData(true)}
        />
      )}
    </div>
  );
}
