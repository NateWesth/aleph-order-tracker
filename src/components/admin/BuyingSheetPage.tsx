import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Download, ShoppingCart, Filter, Package, RefreshCw, Loader2, AlertTriangle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface BuyingSheetRow {
  sku: string;
  itemName: string;
  totalNeeded: number;
  stockOnHand: number;
  onPurchaseOrder: number;
  toOrder: number;
  orders: { orderNumber: string; customerName: string; quantity: number }[];
  supplierName: string;
  supplierId: string | null;
}

interface ZohoStockData {
  [sku: string]: { stockOnHand: number; onPurchaseOrder: number; vendorName?: string };
}

export default function BuyingSheetPage() {
  const { toast } = useToast();
  const [rows, setRows] = useState<BuyingSheetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [zohoLoading, setZohoLoading] = useState(false);
  const [zohoData, setZohoData] = useState<ZohoStockData | null>(null);
  const [search, setSearch] = useState("");
  const [supplierFilter, setSupplierFilter] = useState<string>("all");
  const [showOnlyNeedOrder, setShowOnlyNeedOrder] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const getAuthHeaders = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    return {
      'Authorization': `Bearer ${token}`,
      'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    };
  };

  const fetchZohoData = async (): Promise<ZohoStockData | null> => {
    setZohoLoading(true);
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const headers = await getAuthHeaders();
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/buying-sheet-data`,
        { headers }
      );
      const result = await response.json();
      if (result.success && result.data) {
        setZohoData(result.data);
        return result.data;
      } else {
        console.error("Zoho data fetch failed:", result.error);
        toast({ title: "Zoho Data", description: result.error || "Could not fetch stock data from Zoho", variant: "destructive" });
        return null;
      }
    } catch (error) {
      console.error("Failed to fetch Zoho data:", error);
      toast({ title: "Error", description: "Failed to connect to Zoho Books", variant: "destructive" });
      return null;
    } finally {
      setZohoLoading(false);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch Zoho data and local data in parallel
      const [zoho] = await Promise.all([fetchZohoData()]);

      // Fetch awaiting-stock order items
      const { data: orderItems, error: itemsError } = await supabase
        .from("order_items")
        .select("id, name, code, quantity, progress_stage, order_id")
        .in("progress_stage", ["awaiting-stock"])
        .order("created_at", { ascending: false });

      if (itemsError) throw itemsError;
      if (!orderItems?.length) { setRows([]); return; }

      const orderIds = [...new Set(orderItems.map((i) => i.order_id))];

      // Fetch orders, companies, suppliers, POs
      const { data: orders } = await supabase
        .from("orders")
        .select("id, order_number, company_id, supplier_id")
        .in("id", orderIds);

      const companyIds = [...new Set((orders || []).map((o) => o.company_id).filter(Boolean))] as string[];
      const supplierIdsFromOrders = [...new Set((orders || []).map((o) => o.supplier_id).filter(Boolean))] as string[];

      const { data: orderPOs } = await supabase
        .from("order_purchase_orders")
        .select("order_id, supplier_id")
        .in("order_id", orderIds);

      const allSupplierIds = [...new Set([
        ...supplierIdsFromOrders,
        ...(orderPOs || []).map((p) => p.supplier_id),
      ])];

      const [companiesRes, suppliersRes] = await Promise.all([
        companyIds.length > 0 ? supabase.from("companies").select("id, name").in("id", companyIds) : { data: [] },
        allSupplierIds.length > 0 ? supabase.from("suppliers").select("id, name").in("id", allSupplierIds) : { data: [] },
      ]);

      const companiesMap = new Map((companiesRes.data || []).map((c) => [c.id, c.name]));
      const suppliersMap = new Map((suppliersRes.data || []).map((s) => [s.id, s.name]));
      const ordersMap = new Map((orders || []).map((o) => [o.id, o]));
      const orderSupplierMap = new Map<string, { name: string; id: string | null }>();
      (orderPOs || []).forEach((po) => {
        orderSupplierMap.set(po.order_id, {
          name: suppliersMap.get(po.supplier_id) || "Unknown",
          id: po.supplier_id,
        });
      });

      // Aggregate by SKU
      const skuMap = new Map<string, {
        sku: string;
        itemName: string;
        totalNeeded: number;
        orders: { orderNumber: string; customerName: string; quantity: number }[];
        supplierName: string;
        supplierId: string | null;
      }>();

      for (const item of orderItems) {
        const sku = (item.code || "NO-SKU").toUpperCase();
        const order = ordersMap.get(item.order_id);
        const customerName = order?.company_id ? companiesMap.get(order.company_id) || "Unknown" : "Unknown";
        
        let supplierName = "No Supplier";
        let supplierId: string | null = null;
        const poSupplier = orderSupplierMap.get(item.order_id);
        if (poSupplier) { supplierName = poSupplier.name; supplierId = poSupplier.id; }
        else if (order?.supplier_id) { supplierName = suppliersMap.get(order.supplier_id) || "Unknown"; supplierId = order.supplier_id; }

        const existing = skuMap.get(sku);
        if (existing) {
          existing.totalNeeded += item.quantity;
          existing.orders.push({ orderNumber: order?.order_number || "—", customerName, quantity: item.quantity });
        } else {
          skuMap.set(sku, {
            sku,
            itemName: item.name,
            totalNeeded: item.quantity,
            orders: [{ orderNumber: order?.order_number || "—", customerName, quantity: item.quantity }],
            supplierName,
            supplierId,
          });
        }
      }

      // Build rows with Zoho data
      const zohoStock = zoho || zohoData || {};
      const buyingRows: BuyingSheetRow[] = Array.from(skuMap.values()).map((entry) => {
        const zohoEntry = zohoStock[entry.sku] || { stockOnHand: 0, onPurchaseOrder: 0 };
        const toOrder = Math.max(0, entry.totalNeeded - zohoEntry.stockOnHand - zohoEntry.onPurchaseOrder);
        return {
          ...entry,
          stockOnHand: zohoEntry.stockOnHand,
          onPurchaseOrder: zohoEntry.onPurchaseOrder,
          toOrder,
        };
      });

      // Sort by toOrder descending (items that need ordering first)
      buyingRows.sort((a, b) => b.toOrder - a.toOrder);
      setRows(buyingRows);
    } catch (error) {
      console.error("Failed to fetch buying sheet data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshZoho = async () => {
    const zoho = await fetchZohoData();
    if (zoho) {
      setRows((prev) =>
        prev.map((row) => {
          const zohoEntry = zoho[row.sku] || { stockOnHand: 0, onPurchaseOrder: 0 };
          const toOrder = Math.max(0, row.totalNeeded - zohoEntry.stockOnHand - zohoEntry.onPurchaseOrder);
          return { ...row, stockOnHand: zohoEntry.stockOnHand, onPurchaseOrder: zohoEntry.onPurchaseOrder, toOrder };
        })
      );
      toast({ title: "Updated", description: "Stock & PO data refreshed from Zoho Books" });
    }
  };

  const uniqueSuppliers = useMemo(() => {
    const suppliers = new Map<string, string>();
    rows.forEach((r) => { if (r.supplierId) suppliers.set(r.supplierId, r.supplierName); });
    return Array.from(suppliers.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const matchesSearch = !search ||
        row.itemName.toLowerCase().includes(search.toLowerCase()) ||
        row.sku.toLowerCase().includes(search.toLowerCase()) ||
        row.supplierName.toLowerCase().includes(search.toLowerCase()) ||
        row.orders.some((o) => o.orderNumber.toLowerCase().includes(search.toLowerCase()) || o.customerName.toLowerCase().includes(search.toLowerCase()));
      const matchesSupplier = supplierFilter === "all" || row.supplierId === supplierFilter;
      const matchesNeedOrder = !showOnlyNeedOrder || row.toOrder > 0;
      return matchesSearch && matchesSupplier && matchesNeedOrder;
    });
  }, [rows, search, supplierFilter, showOnlyNeedOrder]);

  const totals = useMemo(() => {
    return filteredRows.reduce((acc, r) => ({
      needed: acc.needed + r.totalNeeded,
      inStock: acc.inStock + r.stockOnHand,
      onPO: acc.onPO + r.onPurchaseOrder,
      toOrder: acc.toOrder + r.toOrder,
    }), { needed: 0, inStock: 0, onPO: 0, toOrder: 0 });
  }, [filteredRows]);

  const handleExportCSV = () => {
    const headers = ["SKU", "Item Name", "Total Needed", "In Stock (Zoho)", "On PO (Zoho)", "To Order", "Supplier", "Orders"];
    const csvRows = filteredRows.map((r) => [
      r.sku, r.itemName, r.totalNeeded.toString(), r.stockOnHand.toString(),
      r.onPurchaseOrder.toString(), r.toOrder.toString(), r.supplierName,
      r.orders.map((o) => `${o.orderNumber} (${o.customerName}: ${o.quantity})`).join("; "),
    ]);
    const csv = [headers, ...csvRows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `buying-sheet-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-4 gap-2">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-20" />)}
        </div>
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-primary" />
            <h2 className="text-lg sm:text-xl font-bold text-foreground">Buying Sheet</h2>
            <Badge variant="outline" className="ml-2">{filteredRows.length} SKUs</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleRefreshZoho} disabled={zohoLoading} className="gap-2">
              {zohoLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh Zoho
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportCSV} className="gap-2">
              <Download className="h-4 w-4" />
              Export
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Card className="bg-card/60">
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">Total Needed</p>
              <p className="text-xl font-bold text-foreground">{totals.needed.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card className="bg-card/60">
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">In Stock (Zoho)</p>
              <p className="text-xl font-bold text-green-600">{totals.inStock.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card className="bg-card/60">
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">On PO (Zoho)</p>
              <p className="text-xl font-bold text-blue-600">{totals.onPO.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card className="bg-primary/10 border-primary/20">
            <CardContent className="p-3">
              <p className="text-xs text-primary">To Order</p>
              <p className="text-xl font-bold text-primary">{totals.toOrder.toLocaleString()}</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search items, SKU, order, customer..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={supplierFilter} onValueChange={setSupplierFilter}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <Package className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Supplier" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Suppliers</SelectItem>
              {uniqueSuppliers.map(([id, name]) => (
                <SelectItem key={id} value={id}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant={showOnlyNeedOrder ? "default" : "outline"}
            size="sm"
            onClick={() => setShowOnlyNeedOrder(!showOnlyNeedOrder)}
            className="gap-2 whitespace-nowrap"
          >
            <AlertTriangle className="h-4 w-4" />
            {showOnlyNeedOrder ? "Needs Ordering" : "Show All"}
          </Button>
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Item Name</TableHead>
                    <TableHead className="text-right">Needed</TableHead>
                    <TableHead className="text-right">In Stock</TableHead>
                    <TableHead className="text-right">On PO</TableHead>
                    <TableHead className="text-right">To Order</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Orders</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        {showOnlyNeedOrder ? "All items are covered by stock and POs!" : "No items found"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRows.map((row) => (
                      <TableRow key={row.sku} className={row.toOrder > 0 ? "" : "opacity-60"}>
                        <TableCell className="font-mono text-xs text-muted-foreground">{row.sku}</TableCell>
                        <TableCell className="font-medium max-w-[200px] truncate">{row.itemName}</TableCell>
                        <TableCell className="text-right font-semibold">{row.totalNeeded}</TableCell>
                        <TableCell className="text-right text-green-600 font-medium">{row.stockOnHand}</TableCell>
                        <TableCell className="text-right text-blue-600 font-medium">{row.onPurchaseOrder}</TableCell>
                        <TableCell className="text-right">
                          {row.toOrder > 0 ? (
                            <Badge variant="destructive" className="font-bold">{row.toOrder}</Badge>
                          ) : (
                            <Badge variant="outline" className="text-green-600">0</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">{row.supplierName}</TableCell>
                        <TableCell>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-xs text-muted-foreground cursor-help">
                                {row.orders.length} order{row.orders.length !== 1 ? "s" : ""}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="left" className="max-w-[300px]">
                              <div className="space-y-1">
                                {row.orders.map((o, i) => (
                                  <div key={i} className="text-xs">
                                    <span className="font-mono font-medium">{o.orderNumber}</span>
                                    <span className="text-muted-foreground"> — {o.customerName} ({o.quantity})</span>
                                  </div>
                                ))}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}
