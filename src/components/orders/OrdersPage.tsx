import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import OrdersHeader from "./components/OrdersHeader";
import OrderTable from "./components/OrderTable";
import CreateOrderDialog from "./components/CreateOrderDialog";
import { useOrderData } from "./hooks/useOrderData";
import { useRealtimeOrders } from "./hooks/useRealtimeOrders";

interface OrdersPageProps {
  isAdmin?: boolean;
}

export default function OrdersPage({ isAdmin = false }: OrdersPageProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [ordersWithCompanies, setOrdersWithCompanies] = useState<any[]>([]);
  const {
    orders,
    setOrders,
    loading,
    companies,
    profiles,
    userProfile,
    fetchOrders,
    toast,
    user
  } = useOrderData(isAdmin);

  // Set up real-time subscriptions
  useRealtimeOrders({
    onOrdersChange: fetchOrders,
    isAdmin
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
      const { data: companiesData } = await supabase
        .from('companies')
        .select('id, name')
        .in('id', companyIds);

      const companyMap = new Map(companiesData?.map(c => [c.id, c.name]) || []);

      const ordersWithNames = orders.map(order => ({
        ...order,
        companyName: order.company_id ? companyMap.get(order.company_id) || 'Unknown Company' : 'No Company'
      }));

      setOrdersWithCompanies(ordersWithNames);
    };

    fetchOrdersWithCompanies();
  }, [orders]);

  const deleteOrder = async (orderId: string, orderNumber: string) => {
    try {
      const { error } = await supabase
        .from('orders')
        .delete()
        .eq('id', orderId);

      if (error) throw error;

      setOrders(orders.filter(order => order.id !== orderId));

      toast({
        title: "Order Deleted",
        description: `Order ${orderNumber} has been successfully deleted.`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to delete order. Please try again.",
        variant: "destructive",
      });
    }
  };

  const receiveOrder = async (order: any) => {
    try {
      const { error } = await supabase
        .from('orders')
        .update({ status: 'received' })
        .eq('id', order.id);

      if (error) throw error;

      const progressOrder = {
        id: order.id,
        orderNumber: order.order_number,
        companyName: "Company Name",
        orderDate: new Date(order.created_at),
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: 'received' as const,
        progress: 0,
        progressStage: 'awaiting-stock' as const,
        items: [
          {
            id: "1",
            name: order.description || "Order items",
            quantity: 1,
            delivered: 0,
            completed: false
          }
        ]
      };

      const existingProgressOrders = JSON.parse(localStorage.getItem('progressOrders') || '[]');
      const updatedProgressOrders = [...existingProgressOrders, progressOrder];
      localStorage.setItem('progressOrders', JSON.stringify(updatedProgressOrders));

      const existingDeliveryOrders = JSON.parse(localStorage.getItem('deliveryOrders') || '[]');
      const updatedDeliveryOrders = [...existingDeliveryOrders, progressOrder];
      localStorage.setItem('deliveryOrders', JSON.stringify(updatedDeliveryOrders));

      setOrders(orders.map(o => o.id === order.id ? { ...o, status: 'received' } : o));

      toast({
        title: "Order Received",
        description: `Order ${order.order_number} has been moved to progress tracking.`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to receive order. Please try again.",
        variant: "destructive",
      });
    }
  };

  const filteredOrders = ordersWithCompanies.filter(order =>
    order.order_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    order.companyName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    order.status?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">Loading orders...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <OrdersHeader searchTerm={searchTerm} onSearchChange={setSearchTerm} />
        <CreateOrderDialog
          isAdmin={isAdmin}
          companies={companies}
          profiles={profiles}
          userProfile={userProfile}
          onOrderCreated={fetchOrders}
        />
      </div>
      
      <OrderTable 
        orders={filteredOrders}
        isAdmin={isAdmin}
        onReceiveOrder={receiveOrder}
        onDeleteOrder={deleteOrder}
      />
      <div className="mt-4 text-sm text-gray-600 dark:text-gray-400">
        Total orders: {filteredOrders.length}
      </div>
    </div>
  );
}
