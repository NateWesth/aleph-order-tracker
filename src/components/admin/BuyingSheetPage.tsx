import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Download, ShoppingCart, Filter, Package } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface BuyingSheetItem {
  itemId: string;
  itemName: string;
  sku: string;
  quantity: number;
  supplierName: string;
  supplierId: string | null;
  orderNumber: string;
  orderId: string;
  customerName: string;
  progressStage: string;
}

export default function BuyingSheetPage() {
  const [items, setItems] = useState<BuyingSheetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [supplierFilter, setSupplierFilter] = useState<string>("all");
  const [stageFilter, setStageFilter] = useState<string>("awaiting-stock");

  useEffect(() => {
    fetchBuyingSheetData();
  }, []);

  const fetchBuyingSheetData = async () => {
    setLoading(true);
    try {
      // Fetch order items with their orders
      const { data: orderItems, error: itemsError } = await supabase
        .from("order_items")
        .select("id, name, code, quantity, progress_stage, order_id")
        .order("created_at", { ascending: false });

      if (itemsError) throw itemsError;

      if (!orderItems || orderItems.length === 0) {
        setItems([]);
        setLoading(false);
        return;
      }

      // Get unique order IDs
      const orderIds = [...new Set(orderItems.map((i) => i.order_id))];

      // Fetch orders with company info
      const { data: orders, error: ordersError } = await supabase
        .from("orders")
        .select("id, order_number, company_id, supplier_id")
        .in("id", orderIds);

      if (ordersError) throw ordersError;

      // Get company IDs and supplier IDs
      const companyIds = [...new Set((orders || []).map((o) => o.company_id).filter(Boolean))] as string[];
      const supplierIdsFromOrders = [...new Set((orders || []).map((o) => o.supplier_id).filter(Boolean))] as string[];

      // Fetch order_purchase_orders for supplier linkage
      const { data: orderPOs } = await supabase
        .from("order_purchase_orders")
        .select("order_id, supplier_id, purchase_order_number")
        .in("order_id", orderIds);

      const poSupplierIds = [...new Set((orderPOs || []).map((p) => p.supplier_id))];
      const allSupplierIds = [...new Set([...supplierIdsFromOrders, ...poSupplierIds])];

      // Fetch companies and suppliers in parallel
      const [companiesRes, suppliersRes] = await Promise.all([
        companyIds.length > 0
          ? supabase.from("companies").select("id, name").in("id", companyIds)
          : { data: [] },
        allSupplierIds.length > 0
          ? supabase.from("suppliers").select("id, name").in("id", allSupplierIds)
          : { data: [] },
      ]);

      const companiesMap = new Map((companiesRes.data || []).map((c) => [c.id, c.name]));
      const suppliersMap = new Map((suppliersRes.data || []).map((s) => [s.id, s.name]));
      const ordersMap = new Map((orders || []).map((o) => [o.id, o]));

      // Build PO supplier map (order_id -> supplier name)
      const orderSupplierMap = new Map<string, { name: string; id: string | null }>();
      (orderPOs || []).forEach((po) => {
        orderSupplierMap.set(po.order_id, {
          name: suppliersMap.get(po.supplier_id) || "Unknown",
          id: po.supplier_id,
        });
      });

      // Build buying sheet items
      const buyingItems: BuyingSheetItem[] = orderItems.map((item) => {
        const order = ordersMap.get(item.order_id);
        const companyName = order?.company_id ? companiesMap.get(order.company_id) || "Unknown" : "Unknown";

        // Get supplier: first from PO, then from order
        let supplierName = "No Supplier";
        let supplierId: string | null = null;
        const poSupplier = orderSupplierMap.get(item.order_id);
        if (poSupplier) {
          supplierName = poSupplier.name;
          supplierId = poSupplier.id;
        } else if (order?.supplier_id) {
          supplierName = suppliersMap.get(order.supplier_id) || "Unknown";
          supplierId = order.supplier_id;
        }

        return {
          itemId: item.id,
          itemName: item.name,
          sku: item.code || "—",
          quantity: item.quantity,
          supplierName,
          supplierId,
          orderNumber: order?.order_number || "—",
          orderId: item.order_id,
          customerName: companyName,
          progressStage: item.progress_stage,
        };
      });

      setItems(buyingItems);
    } catch (error) {
      console.error("Failed to fetch buying sheet data:", error);
    } finally {
      setLoading(false);
    }
  };

  // Get unique suppliers for filter
  const uniqueSuppliers = useMemo(() => {
    const suppliers = new Map<string, string>();
    items.forEach((item) => {
      if (item.supplierId) {
        suppliers.set(item.supplierId, item.supplierName);
      }
    });
    return Array.from(suppliers.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [items]);

  // Filter items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesSearch =
        !search ||
        item.itemName.toLowerCase().includes(search.toLowerCase()) ||
        item.sku.toLowerCase().includes(search.toLowerCase()) ||
        item.orderNumber.toLowerCase().includes(search.toLowerCase()) ||
        item.customerName.toLowerCase().includes(search.toLowerCase()) ||
        item.supplierName.toLowerCase().includes(search.toLowerCase());

      const matchesSupplier = supplierFilter === "all" || item.supplierId === supplierFilter;
      const matchesStage = stageFilter === "all" || item.progressStage === stageFilter;

      return matchesSearch && matchesSupplier && matchesStage;
    });
  }, [items, search, supplierFilter, stageFilter]);

  // Group by supplier for summary
  const supplierSummary = useMemo(() => {
    const summary = new Map<string, { count: number; totalQty: number }>();
    filteredItems.forEach((item) => {
      const key = item.supplierName;
      const existing = summary.get(key) || { count: 0, totalQty: 0 };
      existing.count += 1;
      existing.totalQty += item.quantity;
      summary.set(key, existing);
    });
    return Array.from(summary.entries()).sort((a, b) => b[1].count - a[1].count);
  }, [filteredItems]);

  const handleExportCSV = () => {
    const headers = ["Item Name", "SKU", "Quantity", "Supplier", "Order Number", "Customer", "Stage"];
    const rows = filteredItems.map((item) => [
      item.itemName,
      item.sku,
      item.quantity.toString(),
      item.supplierName,
      item.orderNumber,
      item.customerName,
      item.progressStage,
    ]);

    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `buying-sheet-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const stageBadgeVariant = (stage: string) => {
    switch (stage) {
      case "awaiting-stock": return "secondary";
      case "in-stock": return "default";
      case "ready-for-delivery": return "default";
      case "completed": return "outline";
      default: return "secondary";
    }
  };

  const stageLabel = (stage: string) => {
    switch (stage) {
      case "awaiting-stock": return "Awaiting Stock";
      case "in-stock": return "In Stock";
      case "ready-for-delivery": return "Ready";
      case "completed": return "Completed";
      default: return stage;
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShoppingCart className="h-5 w-5 text-primary" />
          <h2 className="text-lg sm:text-xl font-bold text-foreground">Buying Sheet</h2>
          <Badge variant="outline" className="ml-2">
            {filteredItems.length} items
          </Badge>
        </div>
        <Button variant="outline" size="sm" onClick={handleExportCSV} className="gap-2">
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {/* Supplier Summary Cards */}
      {supplierSummary.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
          {supplierSummary.slice(0, 6).map(([name, data]) => (
            <Card key={name} className="bg-card/60">
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground truncate">{name}</p>
                <p className="text-lg font-bold text-foreground">{data.count}</p>
                <p className="text-[10px] text-muted-foreground">{data.totalQty} units</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search items, SKU, order, customer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Stage" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stages</SelectItem>
            <SelectItem value="awaiting-stock">Awaiting Stock</SelectItem>
            <SelectItem value="in-stock">In Stock</SelectItem>
            <SelectItem value="ready-for-delivery">Ready for Delivery</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
          </SelectContent>
        </Select>
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
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item Name</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Order #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Stage</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No items found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredItems.map((item) => (
                    <TableRow key={item.itemId}>
                      <TableCell className="font-medium max-w-[200px] truncate">{item.itemName}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{item.sku}</TableCell>
                      <TableCell className="text-right font-semibold">{item.quantity}</TableCell>
                      <TableCell className="text-sm">{item.supplierName}</TableCell>
                      <TableCell className="font-mono text-xs">{item.orderNumber}</TableCell>
                      <TableCell className="text-sm max-w-[150px] truncate">{item.customerName}</TableCell>
                      <TableCell>
                        <Badge variant={stageBadgeVariant(item.progressStage)} className="text-[10px]">
                          {stageLabel(item.progressStage)}
                        </Badge>
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
  );
}
