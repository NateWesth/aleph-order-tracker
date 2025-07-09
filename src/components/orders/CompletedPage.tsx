
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import { Trash2, Eye, Search, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useGlobalRealtimeOrders } from "./hooks/useGlobalRealtimeOrders";
import ProcessingOrderFilesDialog from "./components/ProcessingOrderFilesDialog";
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
  completedDate?: Date;
  deliveryData?: {
    [itemName: string]: number;
  };
}

interface CompletedPageProps {
  isAdmin: boolean;
}

export default function CompletedPage({
  isAdmin
}: CompletedPageProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [filteredOrders, setFilteredOrders] = useState<Order[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

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

  // Fetch orders with completed status from database
  const fetchCompletedOrders = async () => {
    if (!user?.id) {
      setError('User not authenticated');
      setLoading(false);
      return;
    }
    try {
      console.log('Fetching completed orders from Supabase...');
      setLoading(true);
      setError(null);
      let query = supabase.from('orders').select(`
          *,
          companies (
            name,
            code
          )
        `).eq('status', 'completed').order('completed_date', {
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
        console.error("Error fetching completed orders:", fetchError);
        setError(`Failed to fetch orders: ${fetchError.message}`);
        return;
      }
      console.log('Fetched completed orders from database:', data?.length || 0);
      if (data && data.length > 0) {
        const convertedOrders = data.map((dbOrder: any) => {
          const orderDate = new Date(dbOrder.created_at);
          const completedDate = dbOrder.completed_date ? new Date(dbOrder.completed_date) : new Date();
          return {
            id: dbOrder.id,
            orderNumber: dbOrder.order_number,
            companyName: dbOrder.companies?.name || "Unknown Company",
            orderDate: orderDate,
            dueDate: completedDate,
            completedDate: completedDate,
            status: dbOrder.status,
            items: parseOrderItems(dbOrder.description)
          };
        });
        console.log('Converted completed orders:', convertedOrders.length);
        setOrders(convertedOrders);
        setFilteredOrders(convertedOrders);
      } else {
        setOrders([]);
        setFilteredOrders([]);
      }
    } catch (error) {
      console.error("Failed to fetch completed orders:", error);
      setError(`Failed to fetch orders: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  // Set up real-time subscriptions
  useGlobalRealtimeOrders({
    onOrdersChange: () => {
      console.log('Real-time update detected for completed page, refreshing...');
      fetchCompletedOrders();
    },
    isAdmin,
    pageType: 'completed'
  });

  // Load orders from database on component mount
  useEffect(() => {
    console.log('Completed page mounted, fetching orders...');
    fetchCompletedOrders();
  }, [isAdmin, user?.id]);

  // Filter orders based on search term
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredOrders(orders);
    } else {
      const filtered = orders.filter(order => order.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) || order.companyName.toLowerCase().includes(searchTerm.toLowerCase()) || order.items.some(item => item.name.toLowerCase().includes(searchTerm.toLowerCase())));
      setFilteredOrders(filtered);
    }
  }, [searchTerm, orders]);

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
      console.log('Deleting completed order:', orderId);
      
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
        description: `Completed order ${orderNumber} has been permanently deleted.`
      });

      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder(null);
      }
      
      console.log('Completed order successfully deleted');
      fetchCompletedOrders();
    } catch (error: any) {
      console.error('Error deleting completed order:', error);
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
          <div className="text-lg text-foreground">Loading completed orders...</div>
        </div>
      </div>;
  }

  if (error) {
    return <div className="container mx-auto p-4 bg-background">
        <div className="flex flex-col items-center justify-center h-64">
          <div className="text-lg text-red-600 mb-4">Error: {error}</div>
          <Button onClick={fetchCompletedOrders}>Retry</Button>
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
        <h1 className="text-2xl font-bold text-foreground">Completed Orders</h1>
      </div>

      <div className="bg-card border border-border rounded-lg shadow">
        <div className="p-4 border-b border-border">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-card-foreground">Order History</h2>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search orders..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 w-64 bg-background border-border text-foreground placeholder:text-muted-foreground focus:ring-primary"
              />
            </div>
          </div>
        </div>
        
        {filteredOrders.length === 0 ? <div className="p-4 text-center text-muted-foreground">
            {searchTerm ? `No orders found matching "${searchTerm}".` : "No completed orders found. Orders completed from the Processing page will appear here."}
          </div> : <Table>
            <TableHeader>
              <TableRow className="border-b border-border">
                <TableHead className="text-foreground">Order #</TableHead>
                <TableHead className="text-foreground">Company</TableHead>
                <TableHead className="text-foreground">Date Completed</TableHead>
                <TableHead className="text-foreground">Status</TableHead>
                <TableHead className="text-foreground">Items</TableHead>
                <TableHead className="text-foreground">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredOrders.map(order => <TableRow key={order.id} className="border-b border-border hover:bg-muted/50">
                  <TableCell className="font-medium text-foreground">
                    #{order.orderNumber}
                  </TableCell>
                  <TableCell className="text-foreground">{order.companyName}</TableCell>
                  <TableCell className="text-foreground">{formatSafeDate(order.completedDate || order.dueDate)}</TableCell>
                  <TableCell>
                    <Badge variant="default" className="bg-green-600 text-white">Completed</Badge>
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
                      
                      {isAdmin && <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-100 dark:hover:bg-red-900/20">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="bg-card border-border">
                            <AlertDialogHeader>
                              <AlertDialogTitle className="text-card-foreground">Delete Completed Order</AlertDialogTitle>
                              <AlertDialogDescription className="text-muted-foreground">
                                Are you sure you want to delete completed order {order.orderNumber}? This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel className="border-border text-foreground hover:bg-muted">Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteOrder(order.id, order.orderNumber)} className="bg-red-600 hover:bg-red-700">
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>}
                    </div>
                  </TableCell>
                </TableRow>)}
            </TableBody>
          </Table>}
      </div>

      <ProcessingOrderFilesDialog order={selectedOrder} isOpen={!!selectedOrder} onClose={closeOrderDetails} isAdmin={isAdmin} />
    </div>;
}
