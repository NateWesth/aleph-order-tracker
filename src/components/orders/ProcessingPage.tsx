import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import { Badge } from "@/components/ui/badge";
import { format, startOfMonth, endOfMonth, isSameMonth } from "date-fns";
import { Eye, Package, CheckCircle, Search, Trash2 } from "lucide-react";
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

// Define the order interface - updated to match actual data structure
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
      console.log('Fetching processing orders from Supabase...');
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

      console.log('Fetched processing orders:', data?.length || 0);
      setSupabaseOrders(data || []);
    } catch (error) {
      console.error("Failed to fetch processing orders:", error);
    }
  };

  // Set up real-time subscriptions with improved logging
  useGlobalRealtimeOrders({
    onOrdersChange: () => {
      console.log('Real-time update detected, refreshing processing orders...');
      fetchSupabaseOrders();
    },
    isAdmin,
    pageType: 'processing'
  });

  // Load orders from localStorage on component mount
  useEffect(() => {
    console.log('Loading processing orders from localStorage...');
    const storedProcessingOrders = JSON.parse(localStorage.getItem('processingOrders') || '[]');
    
    // Filter orders based on admin status
    let filteredOrders = storedProcessingOrders;
    if (!isAdmin && user?.id) {
      // For non-admin users, only show their own orders
      filteredOrders = storedProcessingOrders.filter((order: any) => order.userId === user.id);
    }
    
    console.log('Loaded processing orders from localStorage:', filteredOrders.length);
    setOrders(filteredOrders);
    fetchSupabaseOrders();
  }, [isAdmin, user?.id]);

  // Save orders to localStorage whenever orders change
  useEffect(() => {
    if (orders.length > 0) {
      console.log('Saving processing orders to localStorage:', orders.length);
      localStorage.setItem('processingOrders', JSON.stringify(orders));
    }
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
      console.log('Marking order as completed:', orderId);
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
      console.log('Order successfully marked as completed');
    } catch (error: any) {
      console.error('Error marking order as completed:', error);
      toast({
        title: "Error",
        description: "Failed to complete order. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Delete order function for admins
  const deleteOrder = async (orderId: string, orderNumber: string) => {
    if (!isAdmin) return;

    try {
      console.log('Deleting processing order:', orderId);
      
      // Delete from database
      const { error } = await supabase
        .from('orders')
        .delete()
        .eq('id', orderId);

      if (error) throw error;

      // Remove from local processing orders
      const remainingOrders = orders.filter(order => order.id !== orderId);
      setOrders(remainingOrders);
      localStorage.setItem('processingOrders', JSON.stringify(remainingOrders));

      // Also remove from other localStorage arrays if exists
      const existingProgressOrders = JSON.parse(localStorage.getItem('progressOrders') || '[]');
      const updatedProgressOrders = existingProgressOrders.filter((order: Order) => order.id !== orderId);
      localStorage.setItem('progressOrders', JSON.stringify(updatedProgressOrders));

      const existingDeliveryOrders = JSON.parse(localStorage.getItem('deliveryOrders') || '[]');
      const updatedDeliveryOrders = existingDeliveryOrders.filter((order: Order) => order.id !== orderId);
      localStorage.setItem('deliveryOrders', JSON.stringify(updatedDeliveryOrders));

      const existingCompletedOrders = JSON.parse(localStorage.getItem('completedOrders') || '[]');
      const updatedCompletedOrders = existingCompletedOrders.filter((order: Order) => order.id !== orderId);
      localStorage.setItem('completedOrders', JSON.stringify(updatedCompletedOrders));

      toast({
        title: "Order Deleted",
        description: `Order ${orderNumber} has been permanently deleted from all systems.`,
      });

      // Close dialog if the deleted order was being viewed
      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder(null);
      }

      console.log('Processing order successfully deleted');
      
      // Refresh the orders to reflect the change immediately
      fetchSupabaseOrders();
    } catch (error: any) {
      console.error('Error deleting processing order:', error);
      toast({
        title: "Error",
        description: "Failed to delete order. Please try again.",
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

      {/* Real-time Status Indicator */}
      <div className="mb-4 p-2 bg-blue-50 rounded-md border border-blue-200">
        <p className="text-sm text-blue-800">
          🔄 Real-time updates enabled - Changes will appear automatically
        </p>
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
                    <h3 className="font-medium">Order #{order.orderNumber}</h3>
                    {isAdmin && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            className="text-red-600 hover:text-red-700"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Order</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete order {order.orderNumber}? This action cannot be undone and will remove the order from all systems.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction 
                              onClick={() => deleteOrder(order.id, order.orderNumber)}
                              className="bg-red-600 hover:bg-red-700"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
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
                  Order #{selectedOrder.orderNumber} Details
                  {isAdmin && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          className="text-red-600 hover:text-red-700 ml-auto"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Order</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete order {selectedOrder.orderNumber}? This action cannot be undone and will remove the order from all systems.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction 
                            onClick={() => deleteOrder(selectedOrder.id, selectedOrder.orderNumber)}
                            className="bg-red-600 hover:bg-red-700"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Company</p>
                  <p>{selectedOrder.companyName}</p>
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
