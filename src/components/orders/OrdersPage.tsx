
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import OrdersHeader from "./components/OrdersHeader";
import OrderTable from "./components/OrderTable";
import CreateOrderDialog from "./components/CreateOrderDialog";
import OrderExportActions from "./components/OrderExportActions";
import { useOrderData, Order } from "./hooks/useOrderData";
import { useGlobalRealtimeOrders } from "./hooks/useGlobalRealtimeOrders";
import { useCompanyData } from "@/components/admin/hooks/useCompanyData";
import { useAuth } from "@/contexts/AuthContext";
import { sendOrderNotification } from "@/utils/emailNotifications";

interface OrdersPageProps {
  isAdmin?: boolean;
}

// Extend the Order interface to include companyName
interface OrderWithCompany extends Order {
  companyName: string;
}

export default function OrdersPage({
  isAdmin = false
}: OrdersPageProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [ordersWithCompanies, setOrdersWithCompanies] = useState<OrderWithCompany[]>([]);
  const {
    user
  } = useAuth();
  const {
    orders,
    setOrders,
    loading,
    fetchOrders,
    toast,
    userRole,
    userCompanyId
  } = useOrderData();
  const {
    companies
  } = useCompanyData();

  // Set up real-time subscriptions using the enhanced global hook
  useGlobalRealtimeOrders({
    onOrdersChange: fetchOrders,
    isAdmin,
    pageType: 'orders'
  });

  // Fetch company names for orders
  useEffect(() => {
    const fetchOrdersWithCompanies = async () => {
      if (orders.length === 0) {
        setOrdersWithCompanies([]);
        return;
      }

      // Get unique company IDs
      const companyIds = [...new Set(orders.map(order => order.company_id).filter(Boolean))];
      if (companyIds.length === 0) {
        setOrdersWithCompanies(orders.map(order => ({
          ...order,
          companyName: 'No Company'
        })));
        return;
      }

      // Fetch company names
      const {
        data: companiesData
      } = await supabase.from('companies').select('id, name').in('id', companyIds);
      const companyMap = new Map(companiesData?.map(c => [c.id, c.name]) || []);
      const ordersWithNames = orders.map(order => ({
        ...order,
        companyName: order.company_id ? companyMap.get(order.company_id) || 'Unknown Company' : 'No Company'
      })) as OrderWithCompany[];
      setOrdersWithCompanies(ordersWithNames);
    };
    fetchOrdersWithCompanies();
  }, [orders]);

  const receiveOrder = async (order: OrderWithCompany) => {
    try {
      console.log('Receiving order and updating status to received:', order.id);

      // Update order status in database to 'received' - this will trigger real-time updates
      const { error } = await supabase
        .from('orders')
        .update({
          status: 'received',
          updated_at: new Date().toISOString()
        })
        .eq('id', order.id);

      if (error) throw error;

      // Update local state immediately
      setOrders(orders.map(o => 
        o.id === order.id ? { ...o, status: 'received' } : o
      ));

      // Send email notification
      try {
        await sendOrderNotification({
          orderId: order.id,
          orderNumber: order.order_number,
          companyName: order.companyName || 'Unknown Company',
          changeType: 'status_change',
          oldStatus: 'pending',
          newStatus: 'received'
        });
      } catch (emailError) {
        console.error('Failed to send email notification:', emailError);
        // Don't fail the entire operation if email fails
      }

      toast({
        title: "Order Received",
        description: `Order ${order.order_number} has been received and moved to progress tracking. All users will see this update automatically.`
      });

      console.log('Order successfully received and database updated');
    } catch (error: any) {
      console.error('Error receiving order:', error);
      toast({
        title: "Error",
        description: "Failed to receive order. Please try again.",
        variant: "destructive"
      });
    }
  };

  const deleteOrder = async (orderId: string, orderNumber: string) => {
    try {
      const orderToDelete = ordersWithCompanies.find(o => o.id === orderId);
      
      const { error } = await supabase
        .from('orders')
        .delete()
        .eq('id', orderId);

      if (error) throw error;

      setOrders(orders.filter(order => order.id !== orderId));

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
        description: `Order ${orderNumber} has been successfully deleted.`
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to delete order. Please try again.",
        variant: "destructive"
      });
    }
  };

  const filteredOrders = ordersWithCompanies.filter(order => 
    order.order_number.toLowerCase().includes(searchTerm.toLowerCase()) || 
    order.companyName?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    order.status?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return <div className="flex items-center justify-center h-64">
        <div className="text-lg">Loading orders...</div>
      </div>;
  }

  // Convert OrderWithCompany[] to Order[] for OrderExportActions
  const exportOrders = filteredOrders.map(order => ({
    id: order.id,
    order_number: order.order_number,
    description: order.description || '',
    status: order.status,
    total_amount: order.total_amount,
    created_at: order.created_at,
    updated_at: order.updated_at,
    completed_date: order.completed_date,
    company_id: order.company_id,
    user_id: order.user_id,
    progress_stage: order.progress_stage,
    items: order.items,
    companyName: order.companyName
  }));

  return <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <OrdersHeader searchTerm={searchTerm} onSearchChange={setSearchTerm} />
        <div className="flex gap-2">
          <OrderExportActions orders={exportOrders} title="Orders" />
          <CreateOrderDialog 
            isAdmin={isAdmin} 
            companies={companies} 
            profiles={[]} // We'll handle this in CreateOrderDialog
            userProfile={null} // We'll handle this in CreateOrderDialog
            onOrderCreated={fetchOrders} 
          />
        </div>
      </div>

      {/* Enhanced Real-time Status Indicator */}
      
      
      <OrderTable orders={filteredOrders} isAdmin={isAdmin} onReceiveOrder={receiveOrder} onDeleteOrder={deleteOrder} />
      <div className="mt-4 text-sm text-gray-600 dark:text-gray-400">
        Total orders: {filteredOrders.length}
      </div>
    </div>;
}
