import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { format, startOfMonth, endOfMonth, isSameMonth } from "date-fns";
import { Eye, Package, CheckCircle, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useGlobalRealtimeOrders } from "./hooks/useGlobalRealtimeOrders";

// Define the order item interface
interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  delivered?: number;
  completed: boolean;
}

// Define the order file interface
interface OrderFile {
  id: string;
  name: string;
  url: string;
  type: 'invoice' | 'quote' | 'purchase-order' | 'proof-of-payment';
  uploadedBy: 'admin' | 'client';
  uploadDate: Date;
}

// Define the order interface
interface Order {
  id: string;
  orderNumber: string;
  companyName: string;
  orderDate: Date;
  dueDate: Date;
  items: OrderItem[];
  files: OrderFile[];
  status: 'pending' | 'received' | 'in-progress' | 'processing' | 'completed';
}

interface ProcessingPageProps {
  isAdmin: boolean;
}

export default function ProcessingPage({ isAdmin }: ProcessingPageProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [supabaseOrders, setSupabaseOrders] = useState<any[]>([]);

  // Fetch orders from database
  const fetchSupabaseOrders = async () => {
    if (!user?.id) return;

    try {
      let query = supabase
        .from('orders')
        .select('*')
        .eq('status', 'processing')
        .order('created_at', { ascending: false });

      // If user is admin, fetch all orders; otherwise, fetch only user's orders
      if (!isAdmin) {
        query = query.eq('user_id', user.id);
      }

      const { data, error } = await query;

      if (error) {
        console.error("Error fetching processing orders:", error);
        return;
      }

      setSupabaseOrders(data || []);
    } catch (error) {
      console.error("Failed to fetch processing orders:", error);
    }
  };

  // Set up real-time subscriptions
  useGlobalRealtimeOrders({
    onOrdersChange: fetchSupabaseOrders,
    isAdmin,
    pageType: 'processing'
  });

  // Load orders from localStorage on component mount
  useEffect(() => {
    const storedProcessingOrders = JSON.parse(localStorage.getItem('processingOrders') || '[]');
    
    // Filter orders based on admin status
    let filteredOrders = storedProcessingOrders;
    if (!isAdmin && user?.id) {
      // For non-admin users, only show their own orders
      filteredOrders = storedProcessingOrders.filter((order: any) => order.userId === user.id);
    }
    
    setOrders(filteredOrders);
    fetchSupabaseOrders();
  }, [isAdmin, user?.id]);

  // Save orders to localStorage whenever orders change
  useEffect(() => {
    localStorage.setItem('processingOrders', JSON.stringify(orders));
  }, [orders]);

  // View order details
  const viewOrderDetails = (order: Order) => {
    setSelectedOrder(order);
  };

  // Close order details
  const closeOrderDetails = () => {
    setSelectedOrder(null);
  };

  // Mark order as fully completed and move to completed orders
  const markOrderCompleted = async (orderId: string) => {
    if (!isAdmin) return;

    const orderToComplete = orders.find(order => order.id === orderId);
    if (!orderToComplete) return;

    try {
      // Update order status in database to 'completed'
      const { error } = await supabase
        .from('orders')
        .update({ status: 'completed' })
        .eq('id', orderId);

      if (error) throw error;

      // Create completed order with completion date
      const completedOrder = {
        ...orderToComplete,
        status: 'completed' as const,
        completedDate: new Date()
      };

      // Remove from processing orders
      const remainingOrders = orders.filter(order => order.id !== orderId);
      setOrders(remainingOrders);
      localStorage.setItem('processingOrders', JSON.stringify(remainingOrders));

      // Add to completed orders
      const existingCompletedOrders = JSON.parse(localStorage.getItem('completedOrders') || '[]');
      const updatedCompletedOrders = [...existingCompletedOrders, completedOrder];
      localStorage.setItem('completedOrders', JSON.stringify(updatedCompletedOrders));

      toast({
        title: "Order Completed",
        description: "Order has been moved to completed orders.",
      });

      setSelectedOrder(null);
    } catch (error: any) {
      console.error('Error marking order as completed:', error);
      toast({
        title: "Error",
        description: "Failed to complete order. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Filter orders based on search term
  const filteredOrders = orders.filter(order => 
    order.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    order.companyName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Processing Orders</h1>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search orders..."
            className="pl-10 pr-4 py-2 border rounded-md"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Processing Orders */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold">Orders Being Processed</h2>
        </div>
        <div className="divide-y">
          {filteredOrders.length === 0 && (
            <div className="p-4 text-center text-gray-500">
              No orders being processed.
            </div>
          )}
          
          {filteredOrders.map(order => (
            <div 
              key={order.id} 
              className="p-4 hover:bg-gray-50 cursor-pointer"
              onClick={() => viewOrderDetails(order)}
            >
              <div className="flex justify-between items-center">
                <div>
                  <div className="flex items-center gap-2">
                    {order.company?.logo && (
                      <img 
                        src={order.company.logo} 
                        alt={`${order.companyName} logo`} 
                        className="h-6 w-6 rounded object-cover" 
                      />
                    )}
                    <h3 className="font-medium">Order #{order.orderNumber}</h3>
                  </div>
                  <p className="text-sm text-gray-600">{order.companyName}</p>
                  <p className="text-sm text-gray-600">
                    Order Date: {format(order.orderDate, 'MMM d, yyyy')}
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <Badge variant="outline" className="bg-blue-100 text-blue-800">
                    Processing
                  </Badge>
                  {isAdmin && (
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        markOrderCompleted(order.id);
                      }}
                    >
                      Mark Completed
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Order Details Dialog */}
      <Dialog open={!!selectedOrder} onOpenChange={closeOrderDetails}>
        {selectedOrder && (
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>
                <div className="flex items-center gap-2">
                  {selectedOrder.company?.logo && (
                    <img 
                      src={selectedOrder.company.logo} 
                      alt={`${selectedOrder.companyName} logo`} 
                      className="h-6 w-6 rounded object-cover" 
                    />
                  )}
                  Order #{selectedOrder.orderNumber} Details
                </div>
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Company</p>
                  <p>{selectedOrder.companyName}</p>
                  {selectedOrder.company && (
                    <div className="mt-2 text-xs text-gray-600">
                      <p>{selectedOrder.company.address}</p>
                      <p>VAT: {selectedOrder.company.vatNumber}</p>
                      <p>Tel: {selectedOrder.company.phone}</p>
                    </div>
                  )}
                </div>
                <div>
                  <div className="space-y-1">
                    <div>
                      <p className="text-sm text-gray-500">Order Date</p>
                      <p>{format(selectedOrder.orderDate, 'MMM d, yyyy')}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Status</p>
                      <Badge variant="outline" className="bg-blue-100 text-blue-800">
                        Processing
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>
              
              <div>
                <h3 className="font-medium mb-2">Items</h3>
                <div className="border rounded-md divide-y">
                  {selectedOrder.items.map((item) => (
                    <div key={item.id} className="p-3">
                      <div className="flex justify-between">
                        <div>
                          <p>{item.name}</p>
                          <p className="text-sm text-gray-500">
                            Quantity: {item.quantity}
                            {item.delivered ? ` (Delivered: ${item.delivered})` : ''}
                          </p>
                        </div>
                        <div className="text-green-600 text-sm">
                          {item.completed ? 'Completed' : 'Pending'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {isAdmin && (
                <div className="flex justify-end pt-4">
                  <Button 
                    onClick={() => markOrderCompleted(selectedOrder.id)}
                  >
                    Mark as Completed
                  </Button>
                </div>
              )}
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
