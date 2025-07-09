
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { Trash2, Eye, ArrowRight, Play } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useGlobalRealtimeOrders } from "./hooks/useGlobalRealtimeOrders";
import ProgressOrderDetailsDialog from "./components/ProgressOrderDetailsDialog";
import OrderExportActions from "./components/OrderExportActions";
import { sendOrderNotification } from "@/utils/emailNotifications";

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

interface ProgressPageProps {
  isAdmin: boolean;
}

export default function ProgressPage({
  isAdmin
}: ProgressPageProps) {
  const { toast } = useToast();
  const { user } = useAuth();
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

  // Fetch orders with received status from database
  const fetchProgressOrders = async () => {
    if (!user?.id) {
      setError('User not authenticated');
      setLoading(false);
      return;
    }
    try {
      console.log('Fetching progress orders from Supabase...');
      setLoading(true);
      setError(null);
      let query = supabase.from('orders').select(`
          *,
          companies (
            name,
            code
          )
        `).eq('status', 'received').order('created_at', {
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
        console.error("Error fetching progress orders:", fetchError);
        setError(`Failed to fetch orders: ${fetchError.message}`);
        return;
      }
      console.log('Fetched progress orders from database:', data?.length || 0);
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
        console.log('Converted progress orders:', convertedOrders.length);
        setOrders(convertedOrders);
      } else {
        setOrders([]);
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

  // Start processing order and move to processing status
  const startProcessing = async (orderId: string, orderNumber: string) => {
    if (!isAdmin) return;
    
    const orderToProcess = orders.find(order => order.id === orderId);
    
    try {
      console.log('Starting processing for order:', orderId);
      
      const { error } = await supabase
        .from('orders')
        .update({
          status: 'processing',
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId);

      if (error) throw error;

      // Remove from progress orders
      const remainingOrders = orders.filter(order => order.id !== orderId);
      setOrders(remainingOrders);

      // Send email notification
      try {
        await sendOrderNotification({
          orderId,
          orderNumber,
          companyName: orderToProcess?.companyName || 'Unknown Company',
          changeType: 'status_change',
          oldStatus: 'received',
          newStatus: 'processing'
        });
      } catch (emailError) {
        console.error('Failed to send email notification:', emailError);
      }

      toast({
        title: "Processing Started",
        description: `Order ${orderNumber} has been moved to processing status and will appear on the Processing page.`
      });

      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder(null);
      }
      
      console.log('Order successfully moved to processing');
      fetchProgressOrders();
    } catch (error: any) {
      console.error('Error starting processing:', error);
      toast({
        title: "Error",
        description: "Failed to start processing. Please try again.",
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
    
    const orderToDelete = orders.find(order => order.id === orderId);
    
    try {
      console.log('Deleting order:', orderId);
      
      const { error } = await supabase
        .from('orders')
        .delete()
        .eq('id', orderId);

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

      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder(null);
      }
      
      console.log('Order successfully deleted');
      fetchProgressOrders();
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
          <div className="text-lg text-foreground">Loading progress orders...</div>
        </div>
      </div>;
  }

  if (error) {
    return <div className="container mx-auto p-4 bg-background">
        <div className="flex flex-col items-center justify-center h-64">
          <div className="text-lg text-red-600 mb-4">Error: {error}</div>
          <Button onClick={fetchProgressOrders}>Retry</Button>
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

  return <div className="container mx-auto p-4 bg-background">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-foreground">Progress Orders</h1>
      </div>

      <div className="bg-card border border-border rounded-lg shadow">
        <div className="p-4 border-b border-border">
          <h2 className="text-lg font-semibold text-card-foreground">Orders Ready for Processing</h2>
        </div>
        
        {orders.length === 0 ? <div className="p-4 text-center text-muted-foreground">
            No orders in progress. Orders received from the Orders page will appear here.
          </div> : <Table>
            <TableHeader>
              <TableRow className="border-b border-border">
                <TableHead className="text-foreground">Order #</TableHead>
                <TableHead className="text-foreground">Company</TableHead>
                <TableHead className="text-foreground">Date Created</TableHead>
                <TableHead className="text-foreground">Status</TableHead>
                <TableHead className="text-foreground">Items</TableHead>
                <TableHead className="text-foreground">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map(order => <TableRow key={order.id} className="border-b border-border hover:bg-muted/50">
                  <TableCell className="font-medium text-foreground">
                    #{order.orderNumber}
                  </TableCell>
                  <TableCell className="text-foreground">{order.companyName}</TableCell>
                  <TableCell className="text-foreground">{formatSafeDate(order.orderDate)}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">Received</Badge>
                  </TableCell>
                  <TableCell className="text-foreground">{order.items.length} items</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <OrderExportActions 
                        order={{
                          id: order.id,
                          order_number: order.orderNumber,
                          description: order.items.map(item => `${item.name} (Qty: ${item.quantity})`).join('\n'),
                          status: order.status,
                          total_amount: null,
                          created_at: order.orderDate.toISOString(),
                          company_id: null,
                          companyName: order.companyName,
                          items: order.items
                        }}
                      />
                      
                      <Button variant="ghost" size="sm" onClick={() => viewOrderDetails(order)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      
                      {isAdmin && <>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="default" size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
                                <Play className="h-4 w-4 mr-1" />
                                Start Processing
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="bg-card border-border">
                              <AlertDialogHeader>
                                <AlertDialogTitle className="text-card-foreground">Start Processing</AlertDialogTitle>
                                <AlertDialogDescription className="text-muted-foreground">
                                  Are you sure you want to start processing order {order.orderNumber}? This will move it to the Processing page.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel className="border-border text-foreground hover:bg-muted">Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => startProcessing(order.id, order.orderNumber)} className="bg-blue-600 hover:bg-blue-700">
                                  Start Processing
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                          
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-100 dark:hover:bg-red-900/20">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="bg-card border-border">
                              <AlertDialogHeader>
                                <AlertDialogTitle className="text-card-foreground">Delete Order</AlertDialogTitle>
                                <AlertDialogDescription className="text-muted-foreground">
                                  Are you sure you want to delete order {order.orderNumber}? This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel className="border-border text-foreground hover:bg-muted">Cancel</AlertDialogCancel>
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

      <ProgressOrderDetailsDialog order={selectedOrder} isOpen={!!selectedOrder} onClose={closeOrderDetails} isAdmin={isAdmin} />
    </div>;
}
