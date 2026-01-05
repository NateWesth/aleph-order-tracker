import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Package, Trash2, Check, Filter } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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

interface OrdersPageProps {
  isAdmin?: boolean;
  searchTerm?: string;
}

interface Order {
  id: string;
  order_number: string;
  description: string | null;
  status: string | null;
  company_id: string | null;
  created_at: string | null;
  companyName?: string;
}

export default function OrdersPage({
  isAdmin = false,
  searchTerm = ""
}: OrdersPageProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("all");
  const { toast } = useToast();
  const { user } = useAuth();
  const { companies } = useCompanyData();

  const fetchOrders = async () => {
    try {
      // Fetch orders that are NOT delivered (open orders)
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_number, description, status, company_id, created_at")
        .neq("status", "delivered")
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Fetch company names
      const companyIds = [...new Set(data?.map(o => o.company_id).filter(Boolean))];
      let companyMap = new Map<string, string>();
      
      if (companyIds.length > 0) {
        const { data: companiesData } = await supabase
          .from("companies")
          .select("id, name")
          .in("id", companyIds);
        companyMap = new Map(companiesData?.map(c => [c.id, c.name]) || []);
      }

      const ordersWithCompanies = (data || []).map(order => ({
        ...order,
        companyName: order.company_id ? companyMap.get(order.company_id) || "Unknown" : "No Client"
      }));

      setOrders(ordersWithCompanies);
    } catch (error) {
      console.error("Error fetching orders:", error);
      toast({
        title: "Error",
        description: "Failed to load orders",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  useGlobalRealtimeOrders({
    onOrdersChange: fetchOrders,
    isAdmin,
    pageType: "orders"
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
        variant: "destructive"
      });
      return;
    }

    setSubmitting(true);
    try {
      const itemsDescription = orderData.items
        .filter(item => item.name && item.quantity > 0)
        .map(item => `${item.name} (Qty: ${item.quantity})${item.notes ? ` - ${item.notes}` : ""}`)
        .join("\n");

      const { error } = await supabase.from("orders").insert({
        order_number: orderData.orderNumber,
        reference: orderData.reference || null,
        description: itemsDescription,
        notes: orderData.notes || null,
        company_id: orderData.companyId,
        total_amount: orderData.totalAmount || 0,
        user_id: user.id,
        status: "ordered",
        urgency: orderData.urgency
      });

      if (error) throw error;

      toast({
        title: "Order Created",
        description: `Order ${orderData.orderNumber} has been created.`
      });
      setCreateDialogOpen(false);
      fetchOrders();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create order",
        variant: "destructive"
      });
    } finally {
      setSubmitting(false);
    }
  };

  const markAsInStock = async (order: Order) => {
    try {
      const { error } = await supabase
        .from("orders")
        .update({ status: "in-stock", updated_at: new Date().toISOString() })
        .eq("id", order.id);

      if (error) throw error;

      toast({
        title: "Updated",
        description: `Order ${order.order_number} marked as in-stock`
      });
      fetchOrders();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update order",
        variant: "destructive"
      });
    }
  };

  const deleteOrder = async (order: Order) => {
    try {
      const { error } = await supabase.from("orders").delete().eq("id", order.id);
      if (error) throw error;

      toast({
        title: "Deleted",
        description: `Order ${order.order_number} has been deleted`
      });
      fetchOrders();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete order",
        variant: "destructive"
      });
    }
  };

  const filteredOrders = orders.filter(order => {
    // Filter by company
    const matchesCompany = selectedCompanyId === "all" || order.company_id === selectedCompanyId;
    
    // Filter by search term
    const matchesSearch = 
      order.order_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.companyName?.toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesCompany && matchesSearch;
  });

  const getStatusColor = (status: string | null) => {
    switch (status) {
      case "ordered":
        return "bg-amber-100 text-amber-800";
      case "in-stock":
        return "bg-emerald-100 text-emerald-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Loading orders...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-foreground">Open Orders</h2>
          <p className="text-sm text-muted-foreground">
            {filteredOrders.length} order{filteredOrders.length !== 1 ? "s" : ""}
            {selectedCompanyId !== "all" && companies.find(c => c.id === selectedCompanyId) && (
              <span> for {companies.find(c => c.id === selectedCompanyId)?.name}</span>
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

      {/* Orders List */}
      {filteredOrders.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Package className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No open orders</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredOrders.map((order) => (
            <Card key={order.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <span className="font-semibold text-foreground">
                        {order.order_number}
                      </span>
                      <Badge className={getStatusColor(order.status)}>
                        {order.status || "pending"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      {order.companyName}
                    </p>
                    {order.description && (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {order.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    {order.status === "ordered" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => markAsInStock(order)}
                      >
                        <Check className="h-4 w-4 mr-1" />
                        In Stock
                      </Button>
                    )}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Order?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently delete order {order.order_number}.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteOrder(order)}>
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
