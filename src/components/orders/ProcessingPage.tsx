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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Eye, CheckCircle, Search, Trash2, FileText, ChevronDown, ChevronRight } from "lucide-react";
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
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());

  // Parse order items from description - same logic as OrderRow component
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
          delivered: parseInt(match[2]), // Processing orders are fully delivered
          completed: true
        };
      }
      return {
        id: `item-${index}`,
        name: line.trim(),
        quantity: 1,
        delivered: 1,
        completed: true
      };
    }).filter(item => item.name);

    return items;
  };

  // Toggle order expansion
  const toggleOrderExpansion = (orderId: string) => {
    setExpandedOrders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(orderId)) {
        newSet.delete(orderId);
      } else {
        newSet.add(orderId);
      }
      return newSet;
    });
  };

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

      if (!isAdmin) {
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
      
      const transformedOrders = (data || []).map(order => ({
        id: order.id,
        orderNumber: order.order_number,
        companyName: order.companies?.name || "Unknown Company",
        orderDate: new Date(order.created_at),
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: 'processing' as const,
        items: parseOrderItems(order.description),
        files: []
      }));

      setOrders(transformedOrders);
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

  // View order details - now properly parses items like OrdersPage
  const viewOrderDetails = (order: Order) => {
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

  const closeOrderDetails = () => {
    setShowOrderDetails(false);
    setSelectedOrder(null);
  };

  const openFilesDialog = (order: Order) => {
    setFilesDialogOrder(order);
    setShowFilesDialog(true);
  };

  const closeFilesDialog = () => {
    setShowFilesDialog(false);
    setFilesDialogOrder(null);
  };

  const markOrderCompleted = async (orderId: string) => {
    if (!isAdmin) return;

    const orderToComplete = orders.find(order => order.id === orderId);
    if (!orderToComplete) return;

    try {
      console.log('Marking order as completed:', orderId);
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
    } catch (error: any) {
      console.error('Error marking order as completed:', error);
      toast({
        title: "Error",
        description: "Failed to complete order. Please try again.",
        variant: "destructive",
      });
    }
  };

  const deleteOrder = async (orderId: string, orderNumber: string) => {
    if (!isAdmin) return;

    try {
      console.log('Deleting processing order:', orderId);
      
      const { error } = await supabase
        .from('orders')
        .delete()
        .eq('id', orderId);

      if (error) throw error;

      toast({
        title: "Order Deleted",
        description: `Order ${orderNumber} has been permanently deleted from all systems.`,
      });

      if (selectedOrder && selectedOrder.id === orderId) {
        setShowOrderDetails(false);
        setSelectedOrder(null);
      }

      console.log('Processing order successfully deleted');
    } catch (error: any) {
      console.error('Error deleting processing order:', error);
      toast({
        title: "Error",
        description: "Failed to delete order. Please try again.",
        variant: "destructive",
      });
    }
  };

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
          <h2 className="text-lg font-semibold">Orders Being Processed</h2>
        </div>
        <div className="divide-y">
          {filteredOrders.length === 0 && (
            <div className="p-4 text-center text-gray-500">
              No orders being processed.
            </div>
          )}
          
          {filteredOrders.map(order => {
            const isExpanded = expandedOrders.has(order.id);
            
            return (
              <div key={order.id} className="p-4">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-4">
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
                    <div>
                      <p className="text-sm text-gray-600">{order.companyName}</p>
                      <p className="text-sm text-gray-600">
                        Order Date: {format(order.orderDate, 'MMM d, yyyy')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleOrderExpansion(order.id)}
                    >
                      {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      Items ({order.items.length})
                    </Button>
                    
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

                {isExpanded && (
                  <div className="mt-4 border-t pt-4">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Item</TableHead>
                          <TableHead>Quantity Ordered</TableHead>
                          <TableHead>Quantity Delivered</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {order.items.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium">{item.name}</TableCell>
                            <TableCell>{item.quantity}</TableCell>
                            <TableCell>{item.delivered}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="bg-green-100 text-green-800">
                                Complete
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

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

      <ProcessingOrderFilesDialog
        order={filesDialogOrder}
        isOpen={showFilesDialog}
        onClose={closeFilesDialog}
        isAdmin={isAdmin}
      />
    </div>
  );
}
