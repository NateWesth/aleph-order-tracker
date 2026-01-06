import { useState, useEffect, useCallback, useMemo, memo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Plus, Filter } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useGlobalRealtimeOrders } from "./hooks/useGlobalRealtimeOrders";
import { useCompanyData } from "@/components/admin/hooks/useCompanyData";
import OrderForm from "./components/OrderForm";
import OrderStatusColumn from "./components/OrderStatusColumn";

interface OrdersPageProps {
  isAdmin?: boolean;
  searchTerm?: string;
}

interface OrderItem {
  id: string;
  name: string;
  code: string | null;
  quantity: number;
  stock_status: string;
}

interface Order {
  id: string;
  order_number: string;
  description: string | null;
  status: string | null;
  urgency: string | null;
  company_id: string | null;
  created_at: string | null;
  companyName?: string;
  items?: OrderItem[];
}

// Status column configurations - professional dark theme (no partial-stock column)
const STATUS_COLUMNS = [
  {
    key: "ordered",
    label: "Awaiting Stock",
    color: "text-amber-50",
    bgColor: "bg-amber-600",
    nextStatus: "in-stock",
    nextLabel: "All In Stock",
  },
  {
    key: "in-stock",
    label: "In Stock",
    color: "text-sky-50",
    bgColor: "bg-sky-600",
    nextStatus: "in-progress",
    nextLabel: "Start Work",
  },
  {
    key: "in-progress",
    label: "In Progress",
    color: "text-violet-50",
    bgColor: "bg-violet-600",
    nextStatus: "ready",
    nextLabel: "Mark Ready",
  },
  {
    key: "ready",
    label: "Ready for Delivery",
    color: "text-emerald-50",
    bgColor: "bg-emerald-600",
    nextStatus: "delivered",
    nextLabel: "Complete Order",
  },
];

export default function OrdersPage({
  isAdmin = false,
  searchTerm = "",
}: OrdersPageProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("all");
  const { toast } = useToast();
  const { user } = useAuth();
  const { companies } = useCompanyData();

  const fetchOrders = useCallback(async () => {
    try {
      // Fetch all orders except delivered (those go to history)
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_number, description, status, urgency, company_id, created_at")
        .neq("status", "delivered")
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Fetch company names
      const companyIds = [...new Set(data?.map((o) => o.company_id).filter(Boolean))];
      let companyMap = new Map<string, string>();

      if (companyIds.length > 0) {
        const { data: companiesData } = await supabase
          .from("companies")
          .select("id, name")
          .in("id", companyIds);
        companyMap = new Map(companiesData?.map((c) => [c.id, c.name]) || []);
      }

      // Fetch order items for all orders
      const orderIds = data?.map((o) => o.id) || [];
      let orderItemsMap = new Map<string, OrderItem[]>();

      if (orderIds.length > 0) {
        const { data: itemsData } = await supabase
          .from("order_items")
          .select("id, order_id, name, code, quantity, stock_status")
          .in("order_id", orderIds);

        if (itemsData) {
          itemsData.forEach((item) => {
            const existing = orderItemsMap.get(item.order_id) || [];
            existing.push({
              id: item.id,
              name: item.name,
              code: item.code,
              quantity: item.quantity,
              stock_status: item.stock_status,
            });
            orderItemsMap.set(item.order_id, existing);
          });
        }
      }

      const ordersWithData = (data || []).map((order) => ({
        ...order,
        companyName: order.company_id
          ? companyMap.get(order.company_id) || "Unknown"
          : "No Client",
        items: orderItemsMap.get(order.id) || [],
      }));

      setOrders(ordersWithData);
    } catch (error) {
      console.error("Error fetching orders:", error);
      toast({
        title: "Error",
        description: "Failed to load orders",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useGlobalRealtimeOrders({
    onOrdersChange: fetchOrders,
    isAdmin,
    pageType: "orders",
  });

  const handleCreateOrder = async (orderData: {
    orderNumber: string;
    reference?: string;
    companyId: string;
    totalAmount: number;
    urgency: string;
    notes?: string;
    items: any[];
  }) => {
    if (!user?.id) {
      toast({
        title: "Error",
        description: "Please log in to create orders",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      const itemsDescription = orderData.items
        .filter((item) => item.name && item.quantity > 0)
        .map(
          (item) =>
            `${item.name} (Qty: ${item.quantity})${item.notes ? ` - ${item.notes}` : ""}`
        )
        .join("\n");

      // Create the order
      const { data: newOrder, error } = await supabase.from("orders").insert({
        order_number: orderData.orderNumber,
        reference: orderData.reference || null,
        description: itemsDescription,
        notes: orderData.notes || null,
        company_id: orderData.companyId,
        total_amount: orderData.totalAmount || 0,
        user_id: user.id,
        status: "ordered", // Always start in "ordered" (Awaiting Stock)
        urgency: orderData.urgency,
      }).select("id").single();

      if (error) throw error;

      // Insert order items
      const validItems = orderData.items.filter((item) => item.name && item.quantity > 0);
      if (validItems.length > 0 && newOrder) {
        const orderItemsToInsert = validItems.map((item) => ({
          order_id: newOrder.id,
          name: item.name,
          code: item.code || null,
          quantity: item.quantity,
          stock_status: "awaiting",
        }));

        const { error: itemsError } = await supabase
          .from("order_items")
          .insert(orderItemsToInsert);

        if (itemsError) {
          console.error("Error inserting order items:", itemsError);
        }
      }

      toast({
        title: "Order Created",
        description: `Order ${orderData.orderNumber} has been created.`,
      });
      setCreateDialogOpen(false);
      fetchOrders();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create order",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleItemStock = useCallback(async (itemId: string, currentStatus: string) => {
    const newStatus = currentStatus === "awaiting" ? "in-stock" : "awaiting";
    try {
      const { error } = await supabase
        .from("order_items")
        .update({ stock_status: newStatus })
        .eq("id", itemId);

      if (error) throw error;

      // Refresh orders (the database trigger will auto-move the order if all items are in stock)
      fetchOrders();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update item stock status",
        variant: "destructive",
      });
    }
  }, [fetchOrders, toast]);

  const handleMoveOrder = useCallback(async (order: Order, newStatus: string) => {
    try {
      const updateData: any = {
        status: newStatus,
        updated_at: new Date().toISOString(),
      };

      // Set completed_date when marking as delivered
      if (newStatus === "delivered") {
        updateData.completed_date = new Date().toISOString();
      }

      const { error } = await supabase
        .from("orders")
        .update(updateData)
        .eq("id", order.id);

      if (error) throw error;

      toast({
        title: "Updated",
        description: `Order ${order.order_number} moved to ${newStatus}`,
      });
      fetchOrders();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update order",
        variant: "destructive",
      });
    }
  }, [fetchOrders, toast]);

  const handleDeleteOrder = useCallback(async (order: Order) => {
    try {
      const { error } = await supabase.from("orders").delete().eq("id", order.id);
      if (error) throw error;

      toast({
        title: "Deleted",
        description: `Order ${order.order_number} has been deleted`,
      });
      fetchOrders();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete order",
        variant: "destructive",
      });
    }
  }, [fetchOrders, toast]);

  // Memoize filtered orders to prevent unnecessary recalculations
  const filteredOrders = useMemo(() => {
    const searchLower = searchTerm.toLowerCase();
    return orders.filter((order) => {
      const matchesCompany =
        selectedCompanyId === "all" || order.company_id === selectedCompanyId;
      const matchesSearch =
        order.order_number.toLowerCase().includes(searchLower) ||
        order.companyName?.toLowerCase().includes(searchLower);
      return matchesCompany && matchesSearch;
    });
  }, [orders, selectedCompanyId, searchTerm]);

  // Priority order for urgency sorting (lower = higher priority)
  const urgencyPriority: Record<string, number> = useMemo(() => ({
    urgent: 1,
    high: 2,
    normal: 3,
    low: 4,
  }), []);

  // Memoize orders by status to prevent unnecessary sorting
  const ordersByStatus = useMemo(() => {
    const sortOrders = (ordersToSort: Order[]) => {
      return [...ordersToSort].sort((a, b) => {
        const urgencyA = urgencyPriority[a.urgency || "normal"] || 3;
        const urgencyB = urgencyPriority[b.urgency || "normal"] || 3;
        
        if (urgencyA !== urgencyB) {
          return urgencyA - urgencyB;
        }
        
        const dateA = new Date(a.created_at || 0).getTime();
        const dateB = new Date(b.created_at || 0).getTime();
        return dateA - dateB;
      });
    };

    return {
      ordered: sortOrders(filteredOrders.filter((o) => o.status === "ordered")),
      "in-stock": sortOrders(filteredOrders.filter((o) => o.status === "in-stock")),
      "in-progress": sortOrders(filteredOrders.filter((o) => o.status === "in-progress")),
      ready: sortOrders(filteredOrders.filter((o) => o.status === "ready")),
    };
  }, [filteredOrders, urgencyPriority]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Loading orders...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-foreground">Orders Board</h2>
          <p className="text-sm text-muted-foreground">
            {filteredOrders.length} order{filteredOrders.length !== 1 ? "s" : ""}
            {selectedCompanyId !== "all" &&
              companies.find((c) => c.id === selectedCompanyId) && (
                <span>
                  {" "}
                  for {companies.find((c) => c.id === selectedCompanyId)?.name}
                </span>
              )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Company Filter */}
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filter by client" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Clients</SelectItem>
                {companies.map((company) => (
                  <SelectItem key={company.id} value={company.id}>
                    {company.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Order
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create New Order</DialogTitle>
              </DialogHeader>
              <OrderForm onSubmit={handleCreateOrder} loading={submitting} />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Kanban Board */}
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-4 min-w-max">
          {STATUS_COLUMNS.map((column) => (
            <OrderStatusColumn
              key={column.key}
              config={column}
              orders={ordersByStatus[column.key as keyof typeof ordersByStatus] || []}
              onMoveOrder={handleMoveOrder}
              onDeleteOrder={handleDeleteOrder}
              onToggleItemStock={handleToggleItemStock}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
