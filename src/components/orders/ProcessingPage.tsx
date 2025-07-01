import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { Trash2, Eye, CheckCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useGlobalRealtimeOrders } from "./hooks/useGlobalRealtimeOrders";
import ProcessingOrderFilesDialog from "./components/ProcessingOrderFilesDialog";

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  delivered_quantity?: number;
  unit?: string;
  notes?: string;
}
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
  progress_stage?: string;
  deliveryData?: {
    [itemName: string]: number;
  };
}
interface ProcessingPageProps {
  isAdmin: boolean;
}
export default function ProcessingPage({
  isAdmin
}: ProcessingPageProps) {
  const {
    toast
  } = useToast();
  const {
    user
  } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Parse order items from description
  const parseOrderItems = (description: string | null): OrderItem[] => {
    if (!description) {
      return [];
    }
    const items = description.split('\n').map((line, index) => {
      const match = line.match(/^(.+?)\s*\(Qty:\s*(\d+)\)$/);
      if (match) {
        return {
          id: `item-${index}`,
          name: match[1].trim(),
          quantity: parseInt(match[2]),
          delivered_quantity: 0,
          unit: '',
          notes: ''
        };
      }
      return {
        id: `item-${index}`,
        name: line.trim(),
        quantity: 1,
        delivered_quantity: 0,
        unit: '',
        notes: ''
      };
    }).filter(item => item.name);
    return items;
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

  // Fetch orders with processing status from database
  const fetchProcessingOrders = async () => {
    if (!user?.id) {
      setError('User not authenticated');
      setLoading(false);
      return;
    }
    try {
      console.log('Fetching processing orders from Supabase...');
      setLoading(true);
      setError(null);
      let query = supabase.from('orders').select(`
          *,
          companies (
            name,
            code
          )
        `).eq('status', 'processing').order('created_at', {
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
        console.error("Error fetching processing orders:", fetchError);
        setError(`Failed to fetch orders: ${fetchError.message}`);
        return;
      }
      console.log('Fetched processing orders from database:', data?.length || 0);
      if (data && data.length > 0) {
        const convertedOrders = data.map((dbOrder: any) => {
          const orderDate = new Date(dbOrder.created_at);
          const dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + 30);
          return {
            id: dbOrder.id,
            orderNumber: dbOrder.order_number,
            companyName: dbOrder.companies?.name || "Unknown Company",
            orderDate: orderDate,
            dueDate: dueDate,
            status: dbOrder.status,
            items: parseOrderItems(dbOrder.description)
          };
        });
        console.log('Converted processing orders:', convertedOrders.length);
        setOrders(convertedOrders);
      } else {
        setOrders([]);
      }
    } catch (error) {
      console.error("Failed to fetch processing orders:", error);
      setError(`Failed to fetch orders: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  // Set up real-time subscriptions
  useGlobalRealtimeOrders({
    onOrdersChange: () => {
      console.log('Real-time update detected for processing page, refreshing...');
      fetchProcessingOrders();
    },
    isAdmin,
    pageType: 'processing'
  });

  // Load orders from database on component mount
  useEffect(() => {
    console.log('Processing page mounted, fetching orders...');
    fetchProcessingOrders();
  }, [isAdmin, user?.id]);

  // Mark order as completed and move to completed status
  const completeOrder = async (orderId: string, orderNumber: string) => {
    if (!isAdmin) return;
    try {
      console.log('Marking order as completed and moving to completed status:', orderId);
      const {
        error
      } = await supabase.from('orders').update({
        status: 'completed',
        completed_date: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }).eq('id', orderId);
      if (error) throw error;

      // Remove from processing orders
      const remainingOrders = orders.filter(order => order.id !== orderId);
      setOrders(remainingOrders);
      toast({
        title: "Order Completed",
        description: `Order ${orderNumber} has been moved to completed status and will appear on the Completed page.`
      });
      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder(null);
      }
      console.log('Order successfully moved to completed status');
      fetchProcessingOrders();
    } catch (error: any) {
      console.error('Error completing order:', error);
      toast({
        title: "Error",
        description: "Failed to complete order. Please try again.",
        variant: "destructive"
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

  // Delete order function for admins
  const deleteOrder = async (orderId: string, orderNumber: string) => {
    if (!isAdmin) return;
    try {
      console.log('Deleting order:', orderId);
      const {
        error
      } = await supabase.from('orders').delete().eq('id', orderId);
      if (error) throw error;
      const remainingOrders = orders.filter(order => order.id !== orderId);
      setOrders(remainingOrders);
      toast({
        title: "Order Deleted",
        description: `Order ${orderNumber} has been permanently deleted.`
      });
      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder(null);
      }
      console.log('Order successfully deleted');
      fetchProcessingOrders();
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
    return <div className="container mx-auto p-4">
        <div className="flex justify-center items-center h-64">
          <div className="text-lg">Loading processing orders...</div>
        </div>
      </div>;
  }
  if (error) {
    return <div className="container mx-auto p-4">
        <div className="flex flex-col items-center justify-center h-64">
          <div className="text-lg text-red-600 mb-4">Error: {error}</div>
          <Button onClick={fetchProcessingOrders}>Retry</Button>
        </div>
      </div>;
  }
  if (!user) {
    return <div className="container mx-auto p-4">
        <div className="flex flex-col items-center justify-center h-64">
          <div className="text-lg mb-4">Please log in to view orders</div>
        </div>
      </div>;
  }
  return <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Processing Orders</h1>
      </div>

      <div className="mb-4 p-2 bg-blue-50 rounded-md border border-blue-200">
        <p className="text-sm text-blue-800">
          🔄 Real-time updates enabled - Changes will appear automatically across all users
        </p>
      </div>

      <div className="mb-4 p-2 bg-gray-50 rounded-md border border-gray-200">
        <p className="text-xs text-gray-600">
          Debug: Found {orders.length} processing orders | User: {user?.id ? 'Authenticated' : 'Not authenticated'} | Admin: {isAdmin ? 'Yes' : 'No'}
        </p>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold">Supporting Documents</h2>
        </div>
        
        {orders.length === 0 ? <div className="p-4 text-center text-gray-500">
            No orders in processing. Orders completed from the Progress page will appear here.
          </div> : <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order #</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Date Created</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map(order => <TableRow key={order.id}>
                  <TableCell className="font-medium">
                    #{order.orderNumber}
                  </TableCell>
                  <TableCell>{order.companyName}</TableCell>
                  <TableCell>{formatSafeDate(order.orderDate)}</TableCell>
                  <TableCell>
                    <Badge variant="default">Processing</Badge>
                  </TableCell>
                  <TableCell>{order.items.length} items</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm" onClick={() => viewOrderDetails(order)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      
                      {isAdmin && <>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="default" size="sm" className="bg-green-600 hover:bg-green-700 text-white">
                                <CheckCircle className="h-4 w-4 mr-1" />
                                Complete
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Complete Order</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to mark order {order.orderNumber} as completed? This will move it to the Completed page.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => completeOrder(order.id, order.orderNumber)} className="bg-green-600 hover:bg-green-700">
                                  Complete Order
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                          
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Order</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete order {order.orderNumber}? This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => deleteOrder(order.id, order.orderNumber)} className="bg-red-600 hover:bg-red-700">
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </>}
                    </div>
                  </TableCell>
                </TableRow>)}
            </TableBody>
          </Table>}
      </div>

      <ProcessingOrderFilesDialog order={selectedOrder} isOpen={!!selectedOrder} onClose={closeOrderDetails} isAdmin={isAdmin} />
    </div>;
}
