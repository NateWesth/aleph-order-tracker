import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Building2,
  Loader2
} from "lucide-react";
import { format } from "date-fns";
import { useIsMobile } from "@/hooks/use-mobile";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { OrderWithCompany } from "@/components/orders/types/orderTypes";
import OrderDetailsDialog from "@/components/orders/components/OrderDetailsDialog";

interface Supplier {
  id: string;
  name: string;
  code: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
}

interface OrderWithPO {
  id: string;
  order_number: string;
  purchase_order_number: string | null;
  status: string | null;
  urgency: string | null;
  created_at: string;
  company_id: string | null;
  supplier_id: string | null;
  companyName: string;
  supplierName?: string | null;
  description: string | null;
}

interface SupplierGroup {
  supplier: Supplier;
  orders: OrderWithPO[];
  isOpen: boolean;
}

export default function POTrackingPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [orders, setOrders] = useState<OrderWithPO[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [openSuppliers, setOpenSuppliers] = useState<Set<string>>(new Set());
  const [selectedOrder, setSelectedOrder] = useState<OrderWithCompany | null>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const { toast } = useToast();
  const isMobile = useIsMobile();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch all suppliers
      const { data: suppliersData, error: suppliersError } = await supabase
        .from("suppliers")
        .select("*")
        .order("name");

      if (suppliersError) throw suppliersError;
      setSuppliers(suppliersData || []);

      // Fetch all orders that have a supplier_id
      const { data: ordersData, error: ordersError } = await supabase
        .from("orders")
        .select("id, order_number, purchase_order_number, status, urgency, created_at, company_id, supplier_id, description")
        .not("supplier_id", "is", null)
        .order("created_at", { ascending: false });

      if (ordersError) throw ordersError;

      // Fetch company names for all orders
      const companyIds = [...new Set(ordersData?.map(o => o.company_id).filter(Boolean))];
      let companyMap = new Map<string, string>();

      if (companyIds.length > 0) {
        const { data: companiesData } = await supabase
          .from("companies")
          .select("id, name")
          .in("id", companyIds);
        companyMap = new Map(companiesData?.map(c => [c.id, c.name]) || []);
      }

      // Transform orders with company names
      const ordersWithCompany: OrderWithPO[] = (ordersData || []).map(order => ({
        ...order,
        companyName: order.company_id ? companyMap.get(order.company_id) || "Unknown" : "No Client"
      }));

      setOrders(ordersWithCompany);

      // Auto-open suppliers that have orders
      const suppliersWithOrders = new Set(ordersData?.map(o => o.supplier_id).filter(Boolean));
      setOpenSuppliers(suppliersWithOrders as Set<string>);

    } catch (error: any) {
      console.error("Error fetching PO tracking data:", error);
      toast({
        title: "Error",
        description: "Failed to load PO tracking data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string | null) => {
    switch (status?.toLowerCase()) {
      case "delivered":
      case "completed":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300";
      case "in-progress":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300";
      case "ready":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300";
      case "in-stock":
        return "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-300";
      case "ordered":
        return "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300";
    }
  };

  const getUrgencyColor = (urgency: string | null) => {
    switch (urgency?.toLowerCase()) {
      case "urgent":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300";
      case "high":
        return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300";
      case "low":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300";
    }
  };

  // Filter and group orders by supplier
  const supplierGroups = useMemo(() => {
    // Filter orders based on search term
    const filteredOrders = orders.filter(order => {
      const searchLower = searchTerm.toLowerCase();
      return (
        order.order_number.toLowerCase().includes(searchLower) ||
        order.purchase_order_number?.toLowerCase().includes(searchLower) ||
        order.companyName.toLowerCase().includes(searchLower)
      );
    });

    // Group orders by supplier
    const ordersBySupplier = new Map<string, OrderWithPO[]>();
    filteredOrders.forEach(order => {
      const supplierId = (order as any).supplier_id;
      if (supplierId) {
        const existing = ordersBySupplier.get(supplierId) || [];
        existing.push(order);
        ordersBySupplier.set(supplierId, existing);
      }
    });

    // Filter suppliers that match search or have matching orders
    const filteredSuppliers = suppliers.filter(supplier => {
      const searchLower = searchTerm.toLowerCase();
      const hasMatchingOrders = ordersBySupplier.has(supplier.id);
      const supplierMatches = 
        supplier.name.toLowerCase().includes(searchLower) ||
        supplier.code.toLowerCase().includes(searchLower);
      
      return hasMatchingOrders || (searchTerm === "" || supplierMatches);
    });

    return filteredSuppliers.map(supplier => ({
      supplier,
      orders: ordersBySupplier.get(supplier.id) || [],
      isOpen: openSuppliers.has(supplier.id)
    }));
  }, [suppliers, orders, searchTerm, openSuppliers]);

  const toggleSupplier = (supplierId: string) => {
    setOpenSuppliers(prev => {
      const next = new Set(prev);
      if (next.has(supplierId)) {
        next.delete(supplierId);
      } else {
        next.add(supplierId);
      }
      return next;
    });
  };

  const handleOrderClick = (order: OrderWithPO, supplierName: string) => {
    // Convert OrderWithPO to OrderWithCompany for the dialog
    const orderForDialog: OrderWithCompany = {
      id: order.id,
      order_number: order.order_number,
      description: order.description,
      status: order.status,
      urgency: order.urgency,
      company_id: order.company_id,
      created_at: order.created_at,
      companyName: order.companyName,
      supplier_id: order.supplier_id,
      purchase_order_number: order.purchase_order_number,
      supplierName: supplierName
    };
    setSelectedOrder(orderForDialog);
    setDetailsDialogOpen(true);
  };

  // Calculate totals
  const totalLinkedOrders = orders.length;
  const suppliersWithOrders = new Set(orders.map(o => (o as any).supplier_id)).size;

  if (loading) {
    return <PageSkeleton variant="table" />;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">PO Tracking</h2>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <Truck className="h-4 w-4" />
            {suppliersWithOrders} suppliers
          </span>
          <span className="flex items-center gap-1">
            <Package className="h-4 w-4" />
            {totalLinkedOrders} linked orders
          </span>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by supplier, order number, PO number, or client..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Supplier Groups */}
      {supplierGroups.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Truck className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-lg font-medium text-muted-foreground">No purchase orders found</p>
            <p className="text-sm text-muted-foreground mt-1">
              Link orders to suppliers when creating or editing orders
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {supplierGroups.map(group => (
            <Card key={group.supplier.id} className="overflow-hidden">
              <Collapsible
                open={group.isOpen}
                onOpenChange={() => toggleSupplier(group.supplier.id)}
              >
                <CollapsibleTrigger className="w-full">
                  <CardHeader className="py-3 px-4 hover:bg-muted/50 transition-colors cursor-pointer">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {group.isOpen ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                        <div className="flex items-center gap-2">
                          <Truck className="h-4 w-4 text-primary" />
                          <span className="font-semibold">{group.supplier.name}</span>
                          <Badge variant="outline" className="font-mono text-xs">
                            {group.supplier.code}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {group.supplier.contact_person && (
                          <span className="text-sm text-muted-foreground hidden sm:block">
                            {group.supplier.contact_person}
                          </span>
                        )}
                        <Badge variant="secondary">
                          {group.orders.length} order{group.orders.length !== 1 ? 's' : ''}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                
                <CollapsibleContent>
                  <CardContent className="pt-0 pb-3 px-4">
                    {group.orders.length === 0 ? (
                      <div className="text-center py-6 text-muted-foreground text-sm">
                        No orders linked to this supplier
                      </div>
                    ) : isMobile ? (
                      <div className="space-y-2">
                        {group.orders.map(order => (
                          <div 
                            key={order.id} 
                            className="p-3 bg-muted/30 rounded-lg space-y-2 cursor-pointer hover:bg-muted/50 transition-colors"
                            onClick={() => handleOrderClick(order, group.supplier.name)}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Package className="h-4 w-4 text-muted-foreground" />
                                <span className="font-medium">{order.order_number}</span>
                              </div>
                              <Badge className={getStatusColor(order.status)}>
                                {order.status || 'pending'}
                              </Badge>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <div>
                                <p className="text-xs text-muted-foreground">Client</p>
                                <p className="flex items-center gap-1">
                                  <Building2 className="h-3 w-3" />
                                  {order.companyName}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">PO Number</p>
                                <p className="font-mono text-xs">
                                  {order.purchase_order_number || '-'}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span>{format(new Date(order.created_at), 'dd MMM yyyy')}</span>
                              {order.urgency && order.urgency !== 'normal' && (
                                <Badge className={getUrgencyColor(order.urgency)} variant="outline">
                                  {order.urgency}
                                </Badge>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Order #</TableHead>
                            <TableHead>PO Number</TableHead>
                            <TableHead>Client</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Urgency</TableHead>
                            <TableHead>Date</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {group.orders.map(order => (
                            <TableRow 
                              key={order.id} 
                              className="cursor-pointer hover:bg-muted/50"
                              onClick={() => handleOrderClick(order, group.supplier.name)}
                            >
                              <TableCell className="font-medium">
                                {order.order_number}
                              </TableCell>
                              <TableCell className="font-mono text-sm">
                                {order.purchase_order_number || '-'}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1.5">
                                  <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                                  {order.companyName}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge className={getStatusColor(order.status)}>
                                  {order.status || 'pending'}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {order.urgency && order.urgency !== 'normal' ? (
                                  <Badge className={getUrgencyColor(order.urgency)} variant="outline">
                                    {order.urgency}
                                  </Badge>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {format(new Date(order.created_at), 'dd MMM yyyy')}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          ))}
        </div>
      )}

      {/* Order Details Dialog */}
      {selectedOrder && (
        <OrderDetailsDialog
          open={detailsDialogOpen}
          onOpenChange={setDetailsDialogOpen}
          order={selectedOrder}
          isAdmin={true}
          onSave={fetchData}
        />
      )}
    </div>
  );
}
