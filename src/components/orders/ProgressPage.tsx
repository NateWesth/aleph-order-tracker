import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
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
import { format } from "date-fns";
import { Trash2, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useGlobalRealtimeOrders } from "./hooks/useGlobalRealtimeOrders";
import ProgressOrderDetailsDialog from "./components/ProgressOrderDetailsDialog";

// Define the order item interface
interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  delivered?: number;
  completed: boolean;
}

// Define the company interface
interface Company {
  id: string;
  name: string;
  code: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  vatNumber: string;
  logo?: string;
}

// Define the order interface with company details
interface Order {
  id: string;
  orderNumber: string;
  companyName: string;
  company?: Company;
  orderDate: Date;
  dueDate: Date;
  items: OrderItem[];
  status: 'pending' | 'received' | 'in-progress' | 'processing' | 'completed';
  progress?: number;
  progressStage?: 'awaiting-stock' | 'packing' | 'out-for-delivery' | 'completed';
  reference?: string;
  attention?: string;
  // Add progress_stage to track the current stage from database
  progress_stage?: string;
}

interface ProgressPageProps {
  isAdmin: boolean;
}

// Mock companies data with logos and details
const mockCompanies: Company[] = [
  {
    id: "1",
    name: "Pro Process",
    code: "PROPROC",
    contactPerson: "Matthew Smith",
    email: "matthew@proprocess.com",
    phone: "011 234 5678",
    address: "123 Industrial Street, Johannesburg, 2000",
    vatNumber: "4123456789",
    logo: "/lovable-uploads/e1088147-889e-43f6-bdf0-271189b88913.png"
  },
  {
    id: "2",
    name: "XYZ Industries",
    code: "XYZIND",
    contactPerson: "John Doe",
    email: "john@xyzindustries.com",
    phone: "011 987 6543",
    address: "456 Manufacturing Ave, Pretoria, 0001",
    vatNumber: "4987654321"
  }
];

export default function ProgressPage({ isAdmin }: ProgressPageProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Helper function to get proper progress stage based on status and progress_stage
  const getProgressStage = (status: string, progressStage?: string): 'awaiting-stock' | 'packing' | 'out-for-delivery' | 'completed' => {
    // If we have a specific progress_stage from database, use that
    if (progressStage) {
      switch (progressStage) {
        case 'awaiting-stock':
        case 'packing':
        case 'out-for-delivery':
        case 'completed':
          return progressStage as 'awaiting-stock' | 'packing' | 'out-for-delivery' | 'completed';
      }
    }
    
    // Fallback to status-based logic
    switch (status) {
      case 'received':
        return 'awaiting-stock';
      case 'in-progress':
        return 'packing';
      case 'processing':
        return 'out-for-delivery';
      case 'completed':
        return 'completed';
      default:
        return 'awaiting-stock';
    }
  };

  // Helper function to safely format dates
  const formatSafeDate = (date: Date | string | number): string => {
    try {
      const dateObj = new Date(date);
      if (isNaN(dateObj.getTime())) {
        return 'Invalid Date';
      }
      return format(dateObj, 'MMM d, yyyy');
    } catch (error) {
      console.error('Error formatting date:', error);
      return 'Invalid Date';
    }
  };

  // Fetch orders from database with company information
  const fetchProgressOrders = async () => {
    if (!user?.id) {
      setError('User not authenticated');
      setLoading(false);
      return;
    }

    try {
      console.log('Fetching received and in-progress orders from Supabase...');
      setLoading(true);
      setError(null);
      
      let query = supabase
        .from('orders')
        .select(`
          *,
          companies (
            name,
            code
          )
        `)
        .in('status', ['received', 'in-progress'])
        .order('created_at', { ascending: false });

      // If user is admin, fetch all orders; otherwise, fetch only user's orders or company orders
      if (!isAdmin) {
        // For non-admin users, get their profile first to find their company
        const { data: profile } = await supabase
          .from('profiles')
          .select('company_id')
          .eq('id', user.id)
          .single();

        if (profile?.company_id) {
          query = query.eq('company_id', profile.company_id);
        } else {
          query = query.eq('user_id', user.id);
        }
      }

      const { data, error: fetchError } = await query;

      if (fetchError) {
        console.error("Error fetching progress orders:", fetchError);
        setError(`Failed to fetch orders: ${fetchError.message}`);
        return;
      }

      console.log('Fetched orders from database:', data?.length || 0);

      // Convert database orders to local format
      if (data && data.length > 0) {
        const convertedOrders = data.map((dbOrder: any) => {
          const progressStage = getProgressStage(dbOrder.status, dbOrder.progress_stage);
          const progressValue = progressStage === 'awaiting-stock' ? 25 : 
                               progressStage === 'packing' ? 50 : 
                               progressStage === 'out-for-delivery' ? 75 : 100;
          
          // Create safe date objects
          const orderDate = new Date(dbOrder.created_at);
          const dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + 30); // 30 days from now
          
          return {
            id: dbOrder.id,
            orderNumber: dbOrder.order_number,
            companyName: dbOrder.companies?.name || "Unknown Company",
            orderDate: orderDate,
            dueDate: dueDate,
            status: dbOrder.status,
            progress: progressValue,
            progressStage: progressStage,
            progress_stage: dbOrder.progress_stage, // Keep the raw value from database
            items: [
              {
                id: "1",
                name: dbOrder.description || "Order items",
                quantity: 1,
                delivered: 0,
                completed: false
              }
            ]
          };
        });

        console.log('Converted orders for progress page:', convertedOrders.length);
        setOrders(convertedOrders);
        
        // Update localStorage for consistency
        localStorage.setItem('progressOrders', JSON.stringify(convertedOrders));
      } else {
        setOrders([]);
        localStorage.setItem('progressOrders', JSON.stringify([]));
      }
    } catch (error) {
      console.error("Failed to fetch progress orders:", error);
      setError(`Failed to fetch orders: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  // Set up real-time subscriptions
  useGlobalRealtimeOrders({
    onOrdersChange: () => {
      console.log('Real-time update detected for progress page, refreshing...');
      fetchProgressOrders();
    },
    isAdmin,
    pageType: 'progress'
  });

  // Load orders from database on component mount
  useEffect(() => {
    console.log('Progress page mounted, fetching orders...');
    fetchProgressOrders();
  }, [isAdmin, user?.id]);

  // Progress stages with corresponding percentage values
  const progressStages = [
    { id: 'awaiting-stock', name: 'Awaiting Stock', value: 25 },
    { id: 'packing', name: 'Packing', value: 50 },
    { id: 'out-for-delivery', name: 'Out for Delivery', value: 75 },
    { id: 'completed', name: 'Completed', value: 100 },
  ];

  // Update the progress stage of an order and sync to database
  const updateProgressStage = async (orderId: string, stage: string) => {
    if (!isAdmin) return;

    const stageInfo = progressStages.find(s => s.id === stage);
    if (!stageInfo) return;

    try {
      console.log(`Updating order ${orderId} progress stage to ${stage}`);
      
      // If stage is 'completed', move order to completed status
      if (stage === 'completed') {
        // Update the order status to 'completed' and set completed_date
        const { error } = await supabase
          .from('orders')
          .update({ 
            status: 'completed',
            progress_stage: stage,
            completed_date: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', orderId);

        if (error) throw error;

        // Remove from local progress orders state
        const remainingOrders = orders.filter(order => order.id !== orderId);
        setOrders(remainingOrders);

        toast({
          title: "Order Completed",
          description: "Order has been moved to completed status and will appear on the Completed page.",
        });

        console.log('Order successfully moved to completed status');
        
        // Refresh the orders to reflect the change immediately
        fetchProgressOrders();
      } else {
        // Update the progress_stage field in the database to persist the stage
        const { error } = await supabase
          .from('orders')
          .update({ 
            progress_stage: stage,
            updated_at: new Date().toISOString()
          })
          .eq('id', orderId);

        if (error) throw error;

        // Update local state
        setOrders(orders.map(order => {
          if (order.id === orderId) {
            const updatedOrder = {
              ...order,
              progressStage: stage as 'awaiting-stock' | 'packing' | 'out-for-delivery' | 'completed',
              progress: stageInfo.value,
              progress_stage: stage // Update the raw database value
            };
            return updatedOrder;
          }
          return order;
        }));

        toast({
          title: "Progress Updated",
          description: `Order progress updated to ${stageInfo.name}.`,
        });
      }
    } catch (error) {
      console.error('Error updating progress stage:', error);
      toast({
        title: "Error",
        description: "Failed to update progress. Please try again.",
        variant: "destructive",
      });
    }
  };

  // View order details
  const viewOrderDetails = (order: Order) => {
    setSelectedOrder(order);
  };

  // Close order details
  const closeOrderDetails = () => {
    setSelectedOrder(null);
  };

  // Handle order updates from the dialog
  const handleOrderUpdate = (orderId: string, updates: Partial<Order>) => {
    const updatedOrders = orders.map(order => 
      order.id === orderId ? { ...order, ...updates } : order
    );
    setOrders(updatedOrders);
    localStorage.setItem('progressOrders', JSON.stringify(updatedOrders));

    // Also update delivery orders if they exist
    const existingDeliveryOrders = JSON.parse(localStorage.getItem('deliveryOrders') || '[]');
    const updatedDeliveryOrders = existingDeliveryOrders.map((order: Order) => 
      order.id === orderId ? { ...order, ...updates } : order
    );
    localStorage.setItem('deliveryOrders', JSON.stringify(updatedDeliveryOrders));

    // Update selected order if it matches
    if (selectedOrder && selectedOrder.id === orderId) {
      setSelectedOrder({ ...selectedOrder, ...updates });
    }
  };

  // Mark order as complete and move to processing
  const completeOrder = async (orderId: string) => {
    if (!isAdmin) return;

    const orderToComplete = orders.find(order => order.id === orderId);
    if (!orderToComplete) return;

    const areAllItemsCompleted = orderToComplete.items.every(item => item.completed);
    if (!areAllItemsCompleted) {
      toast({
        title: "Cannot Complete Order",
        description: "All items must be marked as complete first.",
        variant: "destructive",
      });
      return;
    }

    try {
      console.log('Completing order and moving to processing:', orderId);
      
      // Update order status in database to 'processing'
      const { error } = await supabase
        .from('orders')
        .update({ 
          status: 'processing',
          progress_stage: 'completed',
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId);

      if (error) throw error;

      // Update all items to be fully delivered
      const completedOrder = {
        ...orderToComplete,
        items: orderToComplete.items.map(item => ({
          ...item,
          completed: true,
          delivered: item.quantity
        })),
        status: 'processing' as const,
        progress: 100,
        progressStage: 'completed' as const
      };

      // Remove from progress orders (localStorage)
      const remainingOrders = orders.filter(order => order.id !== orderId);
      setOrders(remainingOrders);
      localStorage.setItem('progressOrders', JSON.stringify(remainingOrders));

      // Add to processing orders (localStorage)
      const existingProcessingOrders = JSON.parse(localStorage.getItem('processingOrders') || '[]');
      const updatedProcessingOrders = [...existingProcessingOrders, completedOrder];
      localStorage.setItem('processingOrders', JSON.stringify(updatedProcessingOrders));

      // Also remove from delivery notes if exists
      const existingDeliveryOrders = JSON.parse(localStorage.getItem('deliveryOrders') || '[]');
      const updatedDeliveryOrders = existingDeliveryOrders.filter((order: Order) => order.id !== orderId);
      localStorage.setItem('deliveryOrders', JSON.stringify(updatedDeliveryOrders));

      toast({
        title: "Order Completed",
        description: "Order has been moved to processing with all items marked as delivered. All users will see this update automatically.",
      });

      setSelectedOrder(null);
      console.log('Order successfully completed and moved to processing');
      
      // Refresh the orders to reflect the change immediately
      fetchProgressOrders();
    } catch (error: any) {
      console.error('Error completing order:', error);
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
      console.log('Deleting order:', orderId);
      
      // Delete from database
      const { error } = await supabase
        .from('orders')
        .delete()
        .eq('id', orderId);

      if (error) throw error;

      // Remove from local progress orders
      const remainingOrders = orders.filter(order => order.id !== orderId);
      setOrders(remainingOrders);
      localStorage.setItem('progressOrders', JSON.stringify(remainingOrders));

      // Also remove from other localStorage arrays if exists
      ['deliveryOrders', 'processingOrders', 'completedOrders'].forEach(storageKey => {
        const existingOrders = JSON.parse(localStorage.getItem(storageKey) || '[]');
        const updatedOrders = existingOrders.filter((order: Order) => order.id !== orderId);
        localStorage.setItem(storageKey, JSON.stringify(updatedOrders));
      });

      toast({
        title: "Order Deleted",
        description: `Order ${orderNumber} has been permanently deleted from all systems.`,
      });

      // Close dialog if the deleted order was being viewed
      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder(null);
      }

      console.log('Order successfully deleted');
      
      // Refresh the orders to reflect the change immediately
      fetchProgressOrders();
    } catch (error: any) {
      console.error('Error deleting order:', error);
      toast({
        title: "Error",
        description: "Failed to delete order. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Show loading state
  if (loading) {
    return (
      <div className="container mx-auto p-4">
        <div className="flex justify-center items-center h-64">
          <div className="text-lg">Loading orders...</div>
        </div>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="container mx-auto p-4">
        <div className="flex flex-col items-center justify-center h-64">
          <div className="text-lg text-red-600 mb-4">Error: {error}</div>
          <Button onClick={fetchProgressOrders}>Retry</Button>
        </div>
      </div>
    );
  }

  // Show authentication required message
  if (!user) {
    return (
      <div className="container mx-auto p-4">
        <div className="flex flex-col items-center justify-center h-64">
          <div className="text-lg mb-4">Please log in to view orders</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Order Progress Tracking</h1>
      </div>

      {/* Real-time Status Indicator */}
      <div className="mb-4 p-2 bg-blue-50 rounded-md border border-blue-200">
        <p className="text-sm text-blue-800">
          🔄 Real-time updates enabled - Changes will appear automatically across all users
        </p>
      </div>

      {/* Debug Information */}
      <div className="mb-4 p-2 bg-gray-50 rounded-md border border-gray-200">
        <p className="text-xs text-gray-600">
          Debug: Found {orders.length} progress orders | User: {user?.id ? 'Authenticated' : 'Not authenticated'} | Admin: {isAdmin ? 'Yes' : 'No'}
        </p>
      </div>

      {/* In-Progress Orders Table */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold">Orders In Progress</h2>
        </div>
        
        {orders.length === 0 ? (
          <div className="p-4 text-center text-gray-500">
            No orders in progress. Orders marked as "received" should appear here automatically.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Order</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Company</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Status</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Progress</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Due Date</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {orders.map(order => (
                  <tr key={order.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {order.company?.logo && (
                          <img 
                            src={order.company.logo} 
                            alt={`${order.companyName} logo`} 
                            className="h-6 w-6 rounded object-cover" 
                          />
                        )}
                        <span className="font-medium">#{order.orderNumber}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {order.companyName}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={order.status === 'in-progress' ? 'default' : 'secondary'}>
                        {order.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Progress value={order.progress || 0} className="w-20 h-2" />
                        <span className="text-xs text-gray-500">
                          {progressStages.find(s => s.id === order.progressStage)?.name || 'Not started'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {formatSafeDate(order.dueDate)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => viewOrderDetails(order)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        
                        {isAdmin && (
                          <>
                            {progressStages.map((stage) => (
                              <Button 
                                key={stage.id} 
                                variant={order.progressStage === stage.id ? "default" : "outline"}
                                size="sm"
                                onClick={() => updateProgressStage(order.id, stage.id)}
                                className={stage.id === 'completed' ? "bg-green-600 hover:bg-green-700 text-white" : ""}
                              >
                                {stage.name}
                              </Button>
                            ))}
                            
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  className="text-red-600 hover:text-red-700"
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
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Order Details Dialog */}
      <ProgressOrderDetailsDialog
        order={selectedOrder}
        isOpen={!!selectedOrder}
        onClose={closeOrderDetails}
        isAdmin={isAdmin}
      />
    </div>
  );
}
