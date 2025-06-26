import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
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
import { format } from "date-fns";
import { Eye, CheckCircle, Search, Trash2, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useGlobalRealtimeOrders } from "./hooks/useGlobalRealtimeOrders";
import ProcessingOrderFilesDialog from "./components/ProcessingOrderFilesDialog";
import OrderDetailsDialog from "./components/OrderDetailsDialog";

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
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilesDialog, setShowFilesDialog] = useState(false);
  const [filesDialogOrder, setFilesDialogOrder] = useState<Order | null>(null);
  const [showOrderDetails, setShowOrderDetails] = useState(false);

  // Fetch orders from database with company information
  const fetchProcessingOrders = async () => {
    if (!user?.id) return;

    try {
      console.log('Fetching processing orders from Supabase...');
      let query = supabase
        .from('orders')
        .select(`
          *,
          companies (
            name,
            code
          )
        `)
        .eq('status', 'processing')
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

      const { data, error } = await query;

      if (error) {
        console.error("Error fetching processing orders:", error);
        return;
      }

      console.log('Fetched processing orders:', data?.length || 0);
      
      // Transform database orders to match UI format
      const transformedOrders = (data || []).map(order => ({
        id: order.id,
        orderNumber: order.order_number,
        companyName: order.companies?.name || "Unknown Company",
        orderDate: new Date(order.created_at),
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from creation
        status: 'processing' as const,
        items: [
          {
            id: "1",
            name: order.description || "Order items",
            quantity: 1,
            delivered: 1,
            completed: true
          }
        ],
        files: [] // Will be loaded separately when needed
      }));

      setOrders(transformedOrders);
      
      // Also update localStorage for consistency
      localStorage.setItem('processingOrders', JSON.stringify(transformedOrders));
    } catch (error) {
      console.error("Failed to fetch processing orders:", error);
    }
  };

  // Set up real-time subscriptions
  useGlobalRealtimeOrders({
    onOrdersChange: () => {
      console.log('Real-time update detected, refreshing processing orders...');
      fetchProcessingOrders();
    },
    isAdmin,
    pageType: 'processing'
  });

  // Load orders from database on component mount
  useEffect(() => {
    console.log('Loading processing orders from database...');
    fetchProcessingOrders();
  }, [isAdmin, user?.id]);

  // Save orders to localStorage whenever orders change
  useEffect(() => {
    if (orders.length > 0) {
      console.log('Saving processing orders to localStorage:', orders.length);
      localStorage.setItem('processingOrders', JSON.stringify(orders));
    }
  }, [orders]);

  // Parse order items from description - same logic as OrderRow component
  const parseOrderItems = (description: string | null) => {
    if (!description) {
      return [];
    }

    // Parse the description to extract items and quantities
    // Format: "Item Name (Qty: 2)\nAnother Item (Qty: 1)"
    const items = description.split('\n').map(line => {
      const match = line.match(/^(.+?)\s*\(Qty:\s*(\d+)\)$/);
      if (match) {
        return {
          name: match[1].trim(),
          quantity: parseInt(match[2])
        };
      }
      // Fallback for items without quantity format
      return {
        name: line.trim(),
        quantity: 1
      };
    }).filter(item => item.name);

    return items;
  };

  // View order details - now properly parses items like OrdersPage
  const viewOrderDetails = (order: Order) => {
    // Find the original database order for the details dialog
    const fetchOrderForDetails = async () => {
      try {
        const { data } = await supabase
          .from('orders')
          .select(`
            *,
            companies (
              name,
              code
            )
          `)
          .eq('id', order.id)
          .single();

        if (data) {
          // Parse the items from the description
          const parsedItems = parseOrderItems(data.description);
          
          setSelectedOrder({
            ...data,
            companyName: data.companies?.name || "Unknown Company",
            items: parsedItems
          });
          setShowOrderDetails(true);
        }
      } catch (error) {
        console.error('Error fetching order details:', error);
      }
    };

    fetchOrderForDetails();
  };

  // Close order details
  const closeOrderDetails = () => {
    setShowOrderDetails(false);
    setSelectedOrder(null);
  };

  // Open files dialog
  const openFilesDialog = (order: Order) => {
    setFilesDialogOrder(order);
    setShowFilesDialog(true);
  };

  // Close files dialog
  const closeFilesDialog = () => {
    setShowFilesDialog(false);
    setFilesDialogOrder(null);
  };

  // Mark order as fully completed and move to completed orders
  const markOrderCompleted = async (orderId: string) => {
    if (!isAdmin) return;

    const orderToComplete = orders.find(order => order.id === orderId);
    if (!orderToComplete) return;

    try {
      console.log('Marking order as completed:', orderId);
      // Update order status in database to 'completed' with completion date
      const { error } = await supabase
        .from('orders')
        .update({ 
          status: 'completed',
          completed_date: new Date().toISOString()
        })
        .eq('id', orderId);

      if (error) throw error;

      toast({
        title: "Order Completed",
        description: "Order has been moved to completed orders with all files preserved.",
      });

      setShowOrderDetails(false);
      setSelectedOrder(null);
      console.log('Order successfully marked as completed');
      
      // Refresh will happen automatically via real-time updates
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

      toast({
        title: "Order Deleted",
        description: `Order ${orderNumber} has been permanently deleted from all systems.`,
      });

      // Close dialog if the deleted order was being viewed
      if (selectedOrder && selectedOrder.id === orderId) {
        setShowOrderDetails(false);
        setSelectedOrder(null);
      }

      console.log('Processing order successfully deleted');
      
      // Refresh will happen automatically via real-time updates
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
          🔄 Real-time updates enabled - Changes will appear automatically across all users
        </p>
      </div>

      {/* Debug Information */}
      <div className="mb-4 p-2 bg-gray-50 rounded-md border border-gray-200">
        <p className="text-xs text-gray-600">
          Debug: Found {orders.length} processing orders | User: {user?.id ? 'Authenticated' : 'Not authenticated'} | Admin: {isAdmin ? 'Yes' : 'No'}
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
              className="p-4 hover:bg-gray-50"
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
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => openFilesDialog(order)}
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Files
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => viewOrderDetails(order)}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    View Details
                  </Button>
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

      {/* Order Details Dialog - Using the same component as OrdersPage with properly parsed items */}
      {selectedOrder && (
        <OrderDetailsDialog
          open={showOrderDetails}
          onOpenChange={closeOrderDetails}
          orderNumber={selectedOrder.order_number}
          companyName={selectedOrder.companyName}
          status={selectedOrder.status}
          createdAt={selectedOrder.created_at}
          items={selectedOrder.items}
        />
      )}

      {/* Files Dialog */}
      <ProcessingOrderFilesDialog
        order={filesDialogOrder}
        isOpen={showFilesDialog}
        onClose={closeFilesDialog}
        isAdmin={isAdmin}
      />
    </div>
  );
}
