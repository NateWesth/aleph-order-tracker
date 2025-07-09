import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import CreateOrderDialog from "./components/CreateOrderDialog";
import OrdersHeader from "./components/OrdersHeader";
import OrderTable from "./components/OrderTable";
import { OrderWithCompany } from "./types/orderTypes";
import { useGlobalRealtimeOrders } from "./hooks/useGlobalRealtimeOrders";
import { sendOrderNotification } from "@/utils/emailNotifications";
interface OrdersPageProps {
  isAdmin?: boolean;
}
export default function OrdersPage({
  isAdmin = false
}: OrdersPageProps) {
  const {
    toast
  } = useToast();
  const {
    user
  } = useAuth();
  const [orders, setOrders] = useState<OrderWithCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  // Set up real-time subscriptions
  useGlobalRealtimeOrders({
    onOrdersChange: () => {
      console.log('Real-time update detected for orders page, refreshing...');
      fetchOrders();
    },
    isAdmin,
    pageType: 'orders'
  });

  // Fetch orders function
  const fetchOrders = async () => {
    if (!user?.id) {
      setError('User not authenticated');
      setLoading(false);
      return;
    }
    try {
      console.log('Fetching orders from Supabase...');
      setLoading(true);
      setError(null);
      let query = supabase.from('orders').select(`
          *,
          companies (
            name,
            code
          )
        `).in('status', ['pending', 'received']).order('created_at', {
        ascending: false
      });
      if (!isAdmin) {
        const {
          data: profile
        } = await supabase.from('profiles').select('company_id').eq('id', user.id).single();
        if (profile?.company_id) {
          query = query.eq('company_id', profile.company_id);
        } else {
          query = query.eq('user_id', user.id);
        }
      }
      const {
        data,
        error: fetchError
      } = await query;
      if (fetchError) {
        console.error("Error fetching orders:", fetchError);
        setError(`Failed to fetch orders: ${fetchError.message}`);
        return;
      }
      console.log('Fetched orders from database:', data?.length || 0);
      if (data && data.length > 0) {
        const convertedOrders: OrderWithCompany[] = data.map((dbOrder: any) => ({
          id: dbOrder.id,
          order_number: dbOrder.order_number,
          description: dbOrder.description,
          status: dbOrder.status,
          total_amount: dbOrder.total_amount,
          created_at: dbOrder.created_at,
          updated_at: dbOrder.updated_at,
          completed_date: dbOrder.completed_date,
          company_id: dbOrder.company_id,
          user_id: dbOrder.user_id,
          progress_stage: dbOrder.progress_stage,
          companyName: dbOrder.companies?.name || "Unknown Company",
          company: dbOrder.companies ? {
            id: dbOrder.company_id,
            name: dbOrder.companies.name,
            code: dbOrder.companies.code,
            contactPerson: '',
            email: '',
            phone: '',
            address: '',
            vatNumber: ''
          } : undefined
        }));
        console.log('Converted orders:', convertedOrders.length);
        setOrders(convertedOrders);
      } else {
        setOrders([]);
      }
    } catch (error) {
      console.error("Failed to fetch orders:", error);
      setError(`Failed to fetch orders: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  // Load orders on component mount
  useEffect(() => {
    console.log('Orders page mounted, fetching orders...');
    fetchOrders();
  }, [isAdmin, user?.id]);

  // Handle receiving an order (moving from pending to received)
  const handleReceiveOrder = async (order: OrderWithCompany) => {
    if (!isAdmin) return;
    try {
      console.log('Receiving order:', order.id);
      const {
        error
      } = await supabase.from('orders').update({
        status: 'received',
        updated_at: new Date().toISOString()
      }).eq('id', order.id);
      if (error) throw error;

      // Update local state
      const updatedOrders = orders.map(o => o.id === order.id ? {
        ...o,
        status: 'received' as const
      } : o);
      setOrders(updatedOrders);

      // Send email notification
      try {
        await sendOrderNotification({
          orderId: order.id,
          orderNumber: order.order_number,
          companyName: order.companyName,
          changeType: 'status_change',
          oldStatus: 'pending',
          newStatus: 'received'
        });
      } catch (emailError) {
        console.error('Failed to send email notification:', emailError);
      }
      toast({
        title: "Order Received",
        description: `Order ${order.order_number} has been marked as received.`
      });
      console.log('Order successfully received');
      fetchOrders();
    } catch (error: any) {
      console.error('Error receiving order:', error);
      toast({
        title: "Error",
        description: "Failed to receive order. Please try again.",
        variant: "destructive"
      });
    }
  };

  // Handle deleting an order
  const handleDeleteOrder = async (orderId: string, orderNumber: string) => {
    if (!isAdmin) return;
    const orderToDelete = orders.find(order => order.id === orderId);
    try {
      console.log('Deleting order:', orderId);
      const {
        error
      } = await supabase.from('orders').delete().eq('id', orderId);
      if (error) throw error;
      const remainingOrders = orders.filter(order => order.id !== orderId);
      setOrders(remainingOrders);

      // Send email notification
      try {
        await sendOrderNotification({
          orderId,
          orderNumber,
          companyName: orderToDelete?.companyName || 'Unknown Company',
          changeType: 'deleted'
        });
      } catch (emailError) {
        console.error('Failed to send email notification:', emailError);
      }
      toast({
        title: "Order Deleted",
        description: `Order ${orderNumber} has been permanently deleted.`
      });
      console.log('Order successfully deleted');
      fetchOrders();
    } catch (error: any) {
      console.error('Error deleting order:', error);
      toast({
        title: "Error",
        description: "Failed to delete order. Please try again.",
        variant: "destructive"
      });
    }
  };
  if (loading) {
    return <div className="container mx-auto p-4 bg-background">
        <div className="flex justify-center items-center h-64">
          <div className="text-lg text-foreground">Loading orders...</div>
        </div>
      </div>;
  }
  if (error) {
    return <div className="container mx-auto p-4 bg-background">
        <div className="flex flex-col items-center justify-center h-64">
          <div className="text-lg text-red-600 mb-4">Error: {error}</div>
          <Button onClick={fetchOrders}>Retry</Button>
        </div>
      </div>;
  }
  if (!user) {
    return <div className="container mx-auto p-4 bg-background">
        <div className="flex flex-col items-center justify-center h-64">
          <div className="text-lg mb-4 text-foreground">Please log in to view orders</div>
        </div>
      </div>;
  }
  return <div className="container mx-auto p-4 bg-[#2e2e53]/0">
      <OrdersHeader isAdmin={isAdmin} onCreateOrder={() => setIsCreateDialogOpen(true)} />

      <OrderTable orders={orders} isAdmin={isAdmin} onReceiveOrder={handleReceiveOrder} onDeleteOrder={handleDeleteOrder} />

      <CreateOrderDialog isOpen={isCreateDialogOpen} onClose={() => setIsCreateDialogOpen(false)} onOrderCreated={fetchOrders} isAdmin={isAdmin} />
    </div>;
}