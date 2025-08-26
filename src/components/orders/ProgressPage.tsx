import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { format } from "date-fns";
import { Trash2, Eye, ChevronDown, ChevronRight, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserData } from "@/hooks/useUserData";
import { useOptimizedRealtime } from "@/hooks/useOptimizedRealtime";
import ProgressOrderDetailsDialog from "./components/ProgressOrderDetailsDialog";
import ProcessingOrderFilesDialog from "./components/ProcessingOrderFilesDialog";
import OrderExportActions from "./components/OrderExportActions";
import { sendOrderNotification } from "@/utils/emailNotifications";

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
  reference?: string;
  companyName: string;
  company?: Company;
  orderDate: Date;
  dueDate: Date;
  items: OrderItem[];
  status: 'pending' | 'received' | 'in-progress' | 'processing' | 'completed';
  progress?: number;
  progressStage?: 'awaiting-stock' | 'packing' | 'out-for-delivery' | 'completed';
  attention?: string;
  progress_stage?: string;
  deliveryData?: {
    [itemName: string]: number;
  };
}
interface ProgressPageProps {
  isAdmin: boolean;
}

// Mock companies data with logos and details
const mockCompanies: Company[] = [{
  id: "1",
  name: "Pro Process",
  code: "PROPROC",
  contactPerson: "Matthew Smith",
  email: "matthew@proprocess.com",
  phone: "011 234 5678",
  address: "123 Industrial Street, Johannesburg, 2000",
  vatNumber: "4123456789",
  logo: "/lovable-uploads/e1088147-889e-43f6-bdf0-271189b88913.png"
}, {
  id: "2",
  name: "XYZ Industries",
  code: "XYZIND",
  contactPerson: "John Doe",
  email: "john@xyzindustries.com",
  phone: "011 987 6543",
  address: "456 Manufacturing Ave, Pretoria, 0001",
  vatNumber: "4987654321"
}];
export default function ProgressPage({
  isAdmin
}: ProgressPageProps) {
  const {
    toast
  } = useToast();
  const {
    user
  } = useAuth();

  // Get user data from centralized hook
  const { 
    role: userRole, 
    userCompany,
    isLoading: isLoadingUserData 
  } = useUserData();
  const userCompanyId = userCompany?.id || null;

  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [deliveryQuantities, setDeliveryQuantities] = useState<{
    [orderId: string]: {
      [itemName: string]: number;
    };
  }>({});
  const [showFilesDialog, setShowFilesDialog] = useState(false);
  const [filesDialogOrder, setFilesDialogOrder] = useState<Order | null>(null);

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
          delivered: 0,
          completed: false
        };
      }
      return {
        id: `item-${index}`,
        name: line.trim(),
        quantity: 1,
        delivered: 0,
        completed: false
      };
    }).filter(item => item.name);
    return items;
  };

  // Load orders when user data is available
  useEffect(() => {
    if (user?.id && userRole && (userRole === 'admin' || userCompanyId !== null)) {
      console.log('Loading progress orders...');
      loadDeliveryQuantities();
      fetchProgressOrders();
    }
  }, [user?.id, userRole, userCompanyId]);

  // Set up optimized real-time subscriptions
  useOptimizedRealtime({
    table: 'orders',
    event: '*',
    onInsert: () => fetchProgressOrders(),
    onUpdate: () => fetchProgressOrders(),
    onDelete: () => fetchProgressOrders(),
    enabled: !!user?.id
  });

  // Helper function to get proper progress stage based on status and progress_stage
  const getProgressStage = (status: string, progressStage?: string): 'awaiting-stock' | 'packing' | 'out-for-delivery' | 'completed' => {
    if (progressStage) {
      switch (progressStage) {
        case 'awaiting-stock':
        case 'packing':
        case 'out-for-delivery':
        case 'completed':
          return progressStage as 'awaiting-stock' | 'packing' | 'out-for-delivery' | 'completed';
      }
    }
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

  // Load delivery quantities from localStorage
  const loadDeliveryQuantities = async () => {
    try {
      // Load from localStorage as backup
      const saved = localStorage.getItem('deliveryQuantities');
      if (saved) {
        setDeliveryQuantities(JSON.parse(saved));
      }
      
      // Load from database (this would require a delivery_tracking table)
      // For now, we'll store this data in the order description format
    } catch (error) {
      console.error('Error loading delivery quantities:', error);
    }
  };

  // Save delivery quantities to both localStorage and database
  const saveDeliveryQuantitiesToDatabase = async (orderId: string, itemName: string, delivered: number) => {
    try {
      console.log(`Saving to database: Order ${orderId}, Item "${itemName}", Delivered: ${delivered}`);
      
      // Get current order
      const { data: order, error: fetchError } = await supabase
        .from('orders')
        .select('description')
        .eq('id', orderId)
        .single();

      if (fetchError) throw fetchError;

      if (order?.description) {
        console.log('Current description:', order.description);
        
        // Parse current description and update the specific item
        const lines = order.description.split('\n');
        const updatedLines = lines.map(line => {
          // Check if line already has delivered quantity format
          const deliveredMatch = line.match(/^(.+?)\s*\(Qty:\s*(\d+)\)\s*\[Delivered:\s*(\d+)\].*$/);
          if (deliveredMatch && deliveredMatch[1].trim() === itemName) {
            // Update existing delivered quantity
            const newLine = `${deliveredMatch[1]} (Qty: ${deliveredMatch[2]}) [Delivered: ${delivered}]`;
            console.log(`Updated existing line: "${line}" → "${newLine}"`);
            return newLine;
          }
          
          // Check if line matches basic format without delivered quantity
          const basicMatch = line.match(/^(.+?)\s*\(Qty:\s*(\d+)\)(.*)$/);
          if (basicMatch && basicMatch[1].trim() === itemName) {
            // Add delivered quantity to basic format
            const newLine = `${basicMatch[1]} (Qty: ${basicMatch[2]}) [Delivered: ${delivered}]${basicMatch[3]}`;
            console.log(`Added delivery to line: "${line}" → "${newLine}"`);
            return newLine;
          }
          
          return line;
        });

        const updatedDescription = updatedLines.join('\n');
        console.log('Updated description:', updatedDescription);

        // Update the order in database
        const { error: updateError } = await supabase
          .from('orders')
          .update({ 
            description: updatedDescription,
            updated_at: new Date().toISOString()
          })
          .eq('id', orderId);

        if (updateError) throw updateError;

        console.log(`Successfully saved delivery quantity for ${itemName}: ${delivered}`);
        
        // Don't refresh orders immediately - let the real-time subscription handle it
        // This prevents the race condition
      }
    } catch (error) {
      console.error('Error saving delivery quantities to database:', error);
      toast({
        title: "Warning",
        description: "Delivery quantity saved locally but failed to sync to database.",
        variant: "destructive",
      });
    }
  };

  // Update delivery quantity for an item with database persistence
  const updateDeliveryQuantity = async (orderId: string, itemName: string, delivered: number) => {
    console.log(`Updating delivery quantity: Order ${orderId}, Item "${itemName}", Delivered: ${delivered}`);
    
    setDeliveryQuantities(prev => {
      const updated = {
        ...prev,
        [orderId]: {
          ...prev[orderId],
          [itemName]: delivered
        }
      };
      
      console.log('Updated delivery quantities state:', updated);
      
      // Save to localStorage immediately
      try {
        localStorage.setItem('deliveryQuantities', JSON.stringify(updated));
        console.log('Saved to localStorage successfully');
      } catch (error) {
        console.error('Error saving to localStorage:', error);
      }
      
      return updated;
    });

    // Save to database if admin
    if (isAdmin) {
      console.log('Admin user - saving to database...');
      await saveDeliveryQuantitiesToDatabase(orderId, itemName, delivered);
    }
  };

  // Parse delivery quantities from order description
  const parseDeliveryQuantitiesFromDescription = (description: string | null): { [itemName: string]: number } => {
    const deliveries: { [itemName: string]: number } = {};
    
    if (!description) return deliveries;

    console.log('Parsing delivery quantities from description:', description);
    
    const lines = description.split('\n');
    lines.forEach((line, index) => {
      // Look for pattern: "Item Name (Qty: X) [Delivered: Y]"
      const match = line.match(/^(.+?)\s*\(Qty:\s*\d+\)\s*\[Delivered:\s*(\d+)\].*$/);
      if (match) {
        const itemName = match[1].trim();
        const deliveredQty = parseInt(match[2]);
        deliveries[itemName] = deliveredQty;
        console.log(`Found delivered quantity for "${itemName}": ${deliveredQty}`);
      }
    });

    console.log('Parsed deliveries:', deliveries);
    return deliveries;
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

  // Fetch orders from database with company information and delivery quantities
  const fetchProgressOrders = async () => {
    if (!user?.id) {
      setError('User not authenticated');
      setLoading(false);
      return;
    }
    try {
      console.log('Fetching received and in-progress orders from Supabase...');
      console.log('User role:', userRole, 'Company ID:', userCompanyId);
      setLoading(true);
      setError(null);
      let query = supabase.from('orders').select(`
          *,
          companies (
            name,
            code
          )
        `).in('status', ['received', 'in-progress']).order('created_at', {
        ascending: true
      });

      // Apply filtering based on user role
      if (userRole === 'user' && userCompanyId) {
        console.log('Filtering progress orders by company:', userCompanyId);
        query = query.eq('company_id', userCompanyId);
      } else if (userRole === 'user' && !userCompanyId) {
        // If user role but no company ID, filter by user_id as fallback
        console.log('Filtering progress orders by user_id as fallback');
        query = query.eq('user_id', user.id);
      }
      // For admin users, no additional filtering is needed

      const {
        data,
        error: fetchError
      } = await query;
      if (fetchError) {
        console.error("Error fetching progress orders:", fetchError);
        setError(`Failed to fetch orders: ${fetchError.message}`);
        return;
      }
      console.log('Fetched progress orders:', data?.length || 0);
      if (data && data.length > 0) {
        // Extract delivery quantities from descriptions and update state
        const allDeliveryQuantities: { [orderId: string]: { [itemName: string]: number } } = {};
        
        const convertedOrders = data.map((dbOrder: any) => {
          const progressStage = getProgressStage(dbOrder.status, dbOrder.progress_stage);
          const progressValue = progressStage === 'awaiting-stock' ? 25 : progressStage === 'packing' ? 50 : progressStage === 'out-for-delivery' ? 75 : 100;
          const orderDate = new Date(dbOrder.created_at);
          const dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + 30);
          
          // Parse delivery quantities from description
          const orderDeliveries = parseDeliveryQuantitiesFromDescription(dbOrder.description);
          allDeliveryQuantities[dbOrder.id] = orderDeliveries;
          
          return {
            id: dbOrder.id,
            orderNumber: dbOrder.order_number,
            reference: dbOrder.reference,
            companyName: dbOrder.companies?.name || "Unknown Company",
            orderDate: orderDate,
            dueDate: dueDate,
            status: dbOrder.status,
            progress: progressValue,
            progressStage: progressStage,
            progress_stage: dbOrder.progress_stage,
            items: parseOrderItems(dbOrder.description)
          };
        });
        
        // Update delivery quantities state with database values, but preserve current state
        setDeliveryQuantities(prev => {
          const merged = { ...prev };
          // Only update if we have data from database, but preserve any current values
          for (const [orderId, orderDeliveries] of Object.entries(allDeliveryQuantities)) {
            if (Object.keys(orderDeliveries).length > 0) {
              merged[orderId] = {
                ...(merged[orderId] || {}),
                ...orderDeliveries
              };
            }
          }
          console.log('Merged delivery quantities:', merged);
          return merged;
        });
        
        console.log('Converted orders for progress page:', convertedOrders.length);
        setOrders(convertedOrders);
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


  // Progress stages with corresponding percentage values
  const progressStages = [{
    id: 'awaiting-stock',
    name: 'Awaiting Stock',
    value: 25
  }, {
    id: 'packing',
    name: 'Packing',
    value: 50
  }, {
    id: 'out-for-delivery',
    name: 'Out for Delivery',
    value: 75
  }, {
    id: 'completed',
    name: 'Completed',
    value: 100
  }];

  // Update the progress stage of an order and sync to database
  const updateProgressStage = async (orderId: string, stage: string) => {
    if (!isAdmin) return;
    const stageInfo = progressStages.find(s => s.id === stage);
    if (!stageInfo) return;
    const orderToUpdate = orders.find(o => o.id === orderId);
    try {
      console.log(`Updating order ${orderId} progress stage to ${stage}`);
      if (stage === 'completed') {
        // Move to processing instead of completed
        const {
          error
        } = await supabase.from('orders').update({
          status: 'processing',
          progress_stage: 'completed',
          updated_at: new Date().toISOString()
        }).eq('id', orderId);
        if (error) throw error;
        const remainingOrders = orders.filter(order => order.id !== orderId);
        setOrders(remainingOrders);

        // Send email notification
        try {
          await sendOrderNotification({
            orderId,
            orderNumber: orderToUpdate?.orderNumber || 'Unknown',
            companyName: orderToUpdate?.companyName || 'Unknown Company',
            changeType: 'status_change',
            oldStatus: orderToUpdate?.status || 'in-progress',
            newStatus: 'processing'
          });
        } catch (emailError) {
          console.error('Failed to send email notification:', emailError);
        }
        toast({
          title: "Order Moved to Processing",
          description: "Order has been moved to processing stage and will appear on the Processing page."
        });
        console.log('Order successfully moved to processing status');
        fetchProgressOrders();
      } else {
        const {
          error
        } = await supabase.from('orders').update({
          progress_stage: stage,
          updated_at: new Date().toISOString()
        }).eq('id', orderId);
        if (error) throw error;
        setOrders(orders.map(order => {
          if (order.id === orderId) {
            const updatedOrder = {
              ...order,
              progressStage: stage as 'awaiting-stock' | 'packing' | 'out-for-delivery' | 'completed',
              progress: stageInfo.value,
              progress_stage: stage
            };
            return updatedOrder;
          }
          return order;
        }));

        // Send email notification for progress stage updates
        try {
          await sendOrderNotification({
            orderId,
            orderNumber: orderToUpdate?.orderNumber || 'Unknown',
            companyName: orderToUpdate?.companyName || 'Unknown Company',
            changeType: 'updated',
            newStatus: stage
          });
        } catch (emailError) {
          console.error('Failed to send email notification:', emailError);
        }
        toast({
          title: "Progress Updated",
          description: `Order progress updated to ${stageInfo.name}.`
        });
      }
    } catch (error) {
      console.error('Error updating progress stage:', error);
      toast({
        title: "Error",
        description: "Failed to update progress. Please try again.",
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

  // File dialog functions
  const openFilesDialog = (order: Order) => {
    setFilesDialogOrder(order);
    setShowFilesDialog(true);
  };
  
  const closeFilesDialog = () => {
    setShowFilesDialog(false);
    setFilesDialogOrder(null);
  };

  // Handle order updates from the dialog
  const handleOrderUpdate = (orderId: string, updates: Partial<Order>) => {
    const updatedOrders = orders.map(order => order.id === orderId ? {
      ...order,
      ...updates
    } : order);
    setOrders(updatedOrders);
    localStorage.setItem('progressOrders', JSON.stringify(updatedOrders));
    const existingDeliveryOrders = JSON.parse(localStorage.getItem('deliveryOrders') || '[]');
    const updatedDeliveryOrders = existingDeliveryOrders.map((order: Order) => order.id === orderId ? {
      ...order,
      ...updates
    } : order);
    localStorage.setItem('deliveryOrders', JSON.stringify(updatedDeliveryOrders));
    if (selectedOrder && selectedOrder.id === orderId) {
      setSelectedOrder({
        ...selectedOrder,
        ...updates
      });
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
        variant: "destructive"
      });
      return;
    }
    try {
      console.log('Completing order and moving to processing:', orderId);
      const {
        error
      } = await supabase.from('orders').update({
        status: 'processing',
        progress_stage: 'completed',
        updated_at: new Date().toISOString()
      }).eq('id', orderId);
      if (error) throw error;
      const remainingOrders = orders.filter(order => order.id !== orderId);
      setOrders(remainingOrders);
      localStorage.setItem('progressOrders', JSON.stringify(remainingOrders));
      toast({
        title: "Order Moved to Processing",
        description: "Order has been moved to processing stage. All users will see this update automatically."
      });
      setSelectedOrder(null);
      console.log('Order successfully completed and moved to processing');
      fetchProgressOrders();
    } catch (error: any) {
      console.error('Error completing order:', error);
      toast({
        title: "Error",
        description: "Failed to complete order. Please try again.",
        variant: "destructive"
      });
    }
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
      localStorage.setItem('progressOrders', JSON.stringify(remainingOrders));
      ['deliveryOrders', 'processingOrders', 'completedOrders'].forEach(storageKey => {
        const existingOrders = JSON.parse(localStorage.getItem(storageKey) || '[]');
        const updatedOrders = existingOrders.filter((order: Order) => order.id !== orderId);
        localStorage.setItem(storageKey, JSON.stringify(updatedOrders));
      });
      toast({
        title: "Order Deleted",
        description: `Order ${orderNumber} has been permanently deleted from all systems.`
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
          <div className="text-lg text-foreground">Loading orders...</div>
        </div>
      </div>;
  }
  if (error) {
    return <div className="container mx-auto p-4 bg-background">
        <div className="flex flex-col items-center justify-center h-64">
          <div className="text-lg text-destructive mb-4">Error: {error}</div>
          <Button onClick={fetchProgressOrders}>Retry</Button>
        </div>
      </div>;
  }
  if (!user) {
    return <div className="container mx-auto p-4 bg-background">
        <div className="flex flex-col items-center justify-center h-64">
          <div className="text-lg text-foreground mb-4">Please log in to view orders</div>
        </div>
      </div>;
  }
  return <div className="w-full max-w-full p-2 md:p-4 bg-background overflow-x-hidden">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 md:mb-6 gap-3 md:gap-0">
        <h1 className="text-lg md:text-2xl font-bold text-foreground">Order Progress Tracking</h1>
        <div className="w-full md:w-auto">
          <OrderExportActions orders={orders.map(order => ({
            id: order.id,
            order_number: order.orderNumber,
            description: order.items.map(item => `${item.name} (Qty: ${item.quantity})`).join('\n'),
            status: order.status,
            total_amount: null,
            created_at: order.orderDate.toISOString(),
            company_id: null,
            companyName: order.companyName
          }))} title="Progress Orders" />
        </div>
      </div>

      <div className="bg-card rounded-lg shadow w-full max-w-full overflow-x-hidden">
        <div className="p-2 md:p-4 border-b border-border">
          <h2 className="text-base md:text-lg font-semibold text-card-foreground">Orders In Progress</h2>
        </div>
        
        {orders.length === 0 ? <div className="p-4 text-center text-muted-foreground text-sm md:text-base">
            No orders in progress. Orders marked as "received" should appear here automatically.
          </div> : <div className="divide-y divide-border w-full max-w-full overflow-x-hidden">
            {orders.map(order => {
          const isExpanded = expandedOrders.has(order.id);
          const orderDeliveries = deliveryQuantities[order.id] || {};
          return <div key={order.id} className="p-2 md:p-4 w-full max-w-full overflow-x-hidden">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 md:gap-0">
                    <div className="flex flex-col md:flex-row items-start md:items-center gap-2 md:gap-4 w-full">
                       <div className="flex items-center gap-2">
                         {order.company?.logo && <img src={order.company.logo} alt={`${order.companyName} logo`} className="h-4 w-4 md:h-6 md:w-6 rounded object-cover flex-shrink-0" />}
                         <div className="min-w-0 flex-1">
                           <span className="font-medium text-card-foreground text-sm md:text-base truncate">#{order.orderNumber}</span>
                           {order.reference && (
                             <div className="text-xs md:text-sm text-muted-foreground truncate">{order.reference}</div>
                           )}
                         </div>
                       </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs md:text-sm text-muted-foreground truncate">{order.companyName}</p>
                        <p className="text-xs md:text-sm text-muted-foreground">Due: {formatSafeDate(order.dueDate)}</p>
                      </div>
                      <div className="flex flex-col md:flex-row items-start md:items-center gap-2 w-full md:w-auto">
                        <Badge variant={order.status === 'in-progress' ? 'default' : 'secondary'} className="text-xs">
                          {order.status}
                        </Badge>
                        <div className="flex items-center gap-2 w-full md:w-auto">
                          <Progress value={order.progress || 0} className="w-16 md:w-20 h-2" />
                          <span className="text-xs text-muted-foreground truncate">
                            {progressStages.find(s => s.id === order.progressStage)?.name || 'Not started'}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-1 md:gap-3 w-full md:w-auto justify-start md:justify-end md:space-x-2">
                      <Button variant="ghost" size="sm" onClick={() => toggleOrderExpansion(order.id)} className="text-xs md:text-sm h-7 md:h-9 px-2 md:px-4">
                        {isExpanded ? <ChevronDown className="h-3 w-3 md:h-4 md:w-4 mr-1" /> : <ChevronRight className="h-3 w-3 md:h-4 md:w-4 mr-1" />}
                        <span className="hidden sm:inline">Items ({order.items.length})</span>
                        <span className="sm:hidden">({order.items.length})</span>
                       </Button>
                       
                       <Button 
                         variant="ghost" 
                         size="sm" 
                         onClick={() => openFilesDialog(order)}
                         className="text-xs md:text-sm h-7 md:h-9 px-2 md:px-4"
                       >
                         <FileText className="h-3 w-3 md:h-4 md:w-4 mr-1" />
                         <span className="hidden sm:inline">Files</span>
                       </Button>
                      
                      {isAdmin ? <>
                          {progressStages.map(stage => <Button key={stage.id} variant={order.progressStage === stage.id ? "default" : "outline"} size="sm" onClick={() => updateProgressStage(order.id, stage.id)} className={`text-xs h-7 md:h-9 px-2 md:px-4 md:min-w-[100px] ${stage.id === 'completed' ? "bg-green-600 hover:bg-green-700 text-white" : ""}`}>
                              <span className="hidden md:inline">{stage.name}</span>
                              <span className="md:hidden">{stage.name.substring(0, 4)}</span>
                            </Button>)}
                          
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive h-7 md:h-9 w-7 md:w-9 p-0">
                                <Trash2 className="h-3 w-3 md:h-4 md:w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="max-w-sm md:max-w-md">
                              <AlertDialogHeader>
                                <AlertDialogTitle className="text-sm md:text-base">Delete Order</AlertDialogTitle>
                                <AlertDialogDescription className="text-xs md:text-sm">
                                  Are you sure you want to delete order {order.orderNumber}? This action cannot be undone and will remove the order from all systems.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel className="text-xs md:text-sm">Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => deleteOrder(order.id, order.orderNumber)} className="bg-destructive hover:bg-destructive/90 text-xs md:text-sm">
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </> :
                // For client users, show current progress stage as read-only badges
                <>
                          {progressStages.map(stage => {})}
                        </>}
                    </div>
                  </div>

                  {isExpanded && <div className="mt-4 border-t border-border pt-4">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-card-foreground">Item</TableHead>
                            <TableHead className="text-card-foreground">Quantity Ordered</TableHead>
                            <TableHead className="text-card-foreground">Quantity Delivered</TableHead>
                            <TableHead className="text-card-foreground">Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {order.items.sort((a, b) => {
                    const aDelivered = orderDeliveries[a.name] || 0;
                    const bDelivered = orderDeliveries[b.name] || 0;
                    const aCompleted = aDelivered >= a.quantity;
                    const bCompleted = bDelivered >= b.quantity;
                    if (aCompleted && !bCompleted) return 1;
                    if (!aCompleted && bCompleted) return -1;
                    return 0;
                  }).map(item => {
                    const delivered = orderDeliveries[item.name] || 0;
                    const isCompleted = delivered >= item.quantity;
                    return <TableRow key={item.id} className={isCompleted ? "opacity-50" : ""}>
                                  <TableCell className="font-medium text-card-foreground">{item.name}</TableCell>
                                  <TableCell className="text-card-foreground">{item.quantity}</TableCell>
                                   <TableCell>
                                     {isAdmin ? <input 
                                       type="number" 
                                       min="0" 
                                       max={item.quantity} 
                                       value={delivered} 
                                       onChange={e => updateDeliveryQuantity(order.id, item.name, parseInt(e.target.value) || 0)} 
                                       onBlur={(e) => {
                                         // Force a save when user leaves the input field
                                         const currentValue = parseInt(e.target.value) || 0;
                                         if (isAdmin) {
                                           saveDeliveryQuantitiesToDatabase(order.id, item.name, currentValue);
                                         }
                                       }} 
                                       className="w-20 px-2 py-1 border border-border rounded text-sm bg-background text-foreground" 
                                     /> : <span className="text-card-foreground font-medium">{delivered}</span>}
                                   </TableCell>
                                  <TableCell>
                                    {isCompleted ? <Badge variant="outline" className="bg-green-100 text-green-800">
                                        Complete
                                      </Badge> : <Badge variant="outline">
                                        Pending
                                      </Badge>}
                                  </TableCell>
                                </TableRow>;
                  })}
                        </TableBody>
                      </Table>
                    </div>}
                </div>;
        })}
          </div>}
      </div>

      <ProgressOrderDetailsDialog order={selectedOrder} isOpen={!!selectedOrder} onClose={closeOrderDetails} isAdmin={isAdmin} />
      
      <ProcessingOrderFilesDialog 
        order={filesDialogOrder} 
        isOpen={showFilesDialog} 
        onClose={closeFilesDialog} 
        isAdmin={isAdmin} 
      />
    </div>;
}
