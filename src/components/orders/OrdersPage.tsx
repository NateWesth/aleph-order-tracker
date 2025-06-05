
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import OrdersHeader from "./components/OrdersHeader";
import OrderTable from "./components/OrderTable";

interface OrdersPageProps {
  isAdmin?: boolean;
}

interface Order {
  id: string;
  order_number: string;
  description: string | null;
  status: string | null;
  total_amount: number | null;
  created_at: string;
  company_id: string | null;
}

export default function OrdersPage({ isAdmin = false }: OrdersPageProps) {
  const { toast } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOrders(data || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to fetch orders: " + error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

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
        description: "Failed to delete order: " + error.message,
        variant: "destructive",
      });
    }
  };

  const receiveOrder = async (order: Order) => {
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
        description: "Failed to receive order: " + error.message,
        variant: "destructive",
      });
    }
  };

  const filteredOrders = orders.filter(order =>
    order.order_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    order.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
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
      <OrdersHeader searchTerm={searchTerm} onSearchChange={setSearchTerm} />
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
