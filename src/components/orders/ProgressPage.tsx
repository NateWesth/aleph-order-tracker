
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { format } from "date-fns";
import { Eye, Package, Truck, CheckCircle } from "lucide-react";
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

// Mock orders data
const mockOrders: Order[] = [
  {
    id: "1",
    orderNumber: "ORD-2024-001",
    companyName: "Pro Process",
    company: mockCompanies[0],
    orderDate: new Date(2024, 0, 15),
    dueDate: new Date(2024, 1, 15),
    status: "in-progress",
    reference: "MATTHEW",
    attention: "Stores",
    progress: 50,
    progressStage: "packing",
    items: [
      { id: "1", name: "BOSCH Angle grinder (ZAPPPAAG005)", quantity: 2, delivered: 1, completed: true },
      { id: "2", name: "Safety Equipment Set", quantity: 1, delivered: 0, completed: false },
    ]
  },
  {
    id: "2",
    orderNumber: "ORD-2024-002",
    companyName: "XYZ Industries",
    company: mockCompanies[1],
    orderDate: new Date(2024, 0, 20),
    dueDate: new Date(2024, 1, 20),
    status: "received",
    progress: 25,
    progressStage: "awaiting-stock",
    reference: "JOHN",
    attention: "Warehouse",
    items: [
      { id: "3", name: "Welding Equipment", quantity: 3, delivered: 0, completed: false },
      { id: "4", name: "Safety Helmets", quantity: 25, delivered: 0, completed: false },
    ]
  },
];

export default function ProgressPage({ isAdmin }: ProgressPageProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [supabaseOrders, setSupabaseOrders] = useState<any[]>([]);

  // Fetch orders from database
  const fetchSupabaseOrders = async () => {
    if (!user?.id) return;

    try {
      console.log('Fetching progress orders from Supabase...');
      let query = supabase
        .from('orders')
        .select('*')
        .in('status', ['received', 'in-progress'])
        .order('created_at', { ascending: false });

      // If user is admin, fetch all orders; otherwise, fetch only user's orders
      if (!isAdmin) {
        query = query.eq('user_id', user.id);
      }

      const { data, error } = await query;

      if (error) {
        console.error("Error fetching progress orders:", error);
        return;
      }

      console.log('Fetched progress orders:', data?.length || 0);
      setSupabaseOrders(data || []);
    } catch (error) {
      console.error("Failed to fetch progress orders:", error);
    }
  };

  // Set up real-time subscriptions
  useGlobalRealtimeOrders({
    onOrdersChange: () => {
      console.log('Real-time update detected, refreshing progress orders...');
      fetchSupabaseOrders();
    },
    isAdmin,
    pageType: 'progress'
  });

  // Load orders from localStorage on component mount
  useEffect(() => {
    console.log('Loading progress orders from localStorage...');
    const storedProgressOrders = JSON.parse(localStorage.getItem('progressOrders') || '[]');
    
    // Filter orders based on admin status
    let filteredOrders = storedProgressOrders;
    if (!isAdmin && user?.id) {
      // For non-admin users, only show their own orders
      filteredOrders = storedProgressOrders.filter((order: any) => order.userId === user.id);
    }
    
    console.log('Loaded progress orders from localStorage:', filteredOrders.length);
    setOrders(filteredOrders);
    fetchSupabaseOrders();
  }, [isAdmin, user?.id]);

  // Save orders to localStorage whenever orders change
  useEffect(() => {
    if (orders.length > 0) {
      console.log('Saving progress orders to localStorage:', orders.length);
      localStorage.setItem('progressOrders', JSON.stringify(orders));
    }
  }, [orders]);

  // Progress stages with corresponding percentage values
  const progressStages = [
    { id: 'awaiting-stock', name: 'Awaiting Stock', value: 25 },
    { id: 'packing', name: 'Packing', value: 50 },
    { id: 'out-for-delivery', name: 'Out for Delivery', value: 75 },
    { id: 'completed', name: 'Completed', value: 100 },
  ];

  // Update the progress of an order (admin only)
  const updateProgressStage = (orderId: string, stage: string) => {
    if (!isAdmin) return;

    const stageInfo = progressStages.find(s => s.id === stage);
    if (!stageInfo) return;

    setOrders(orders.map(order => {
      if (order.id === orderId) {
        const updatedOrder = { 
          ...order, 
          progressStage: stage as any, 
          progress: stageInfo.value 
        };
        
        // If completed, move to processing
        if (stage === 'completed') {
          updatedOrder.status = 'processing';
        }
        
        return updatedOrder;
      }
      return order;
    }));

    toast({
      title: "Progress Updated",
      description: `Order progress updated to ${stageInfo.name}.`,
    });
    
    if (stage === 'completed') {
      toast({
        title: "Order Completed",
        description: "Order has been moved to processing.",
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

  // Update delivery quantities and completion status (admin only)
  const updateItemDelivery = (orderId: string, itemId: string, delivered: number) => {
    if (!isAdmin) return;

    const updatedOrders = orders.map(order => {
      if (order.id === orderId) {
        return {
          ...order,
          items: order.items.map(item => {
            if (item.id === itemId) {
              return { ...item, delivered };
            }
            return item;
          })
        };
      }
      return order;
    });

    setOrders(updatedOrders);
    localStorage.setItem('progressOrders', JSON.stringify(updatedOrders));

    // Also update delivery orders
    const existingDeliveryOrders = JSON.parse(localStorage.getItem('deliveryOrders') || '[]');
    const updatedDeliveryOrders = existingDeliveryOrders.map((order: Order) => {
      if (order.id === orderId) {
        return {
          ...order,
          items: order.items.map((item: any) => {
            if (item.id === itemId) {
              return { ...item, delivered };
            }
            return item;
          })
        };
      }
      return order;
    });
    localStorage.setItem('deliveryOrders', JSON.stringify(updatedDeliveryOrders));

    // Update selected order if it matches
    if (selectedOrder && selectedOrder.id === orderId) {
      setSelectedOrder({
        ...selectedOrder,
        items: selectedOrder.items.map(item => {
          if (item.id === itemId) {
            return { ...item, delivered };
          }
          return item;
        })
      });
    }
  };

  const toggleItemCompletion = (orderId: string, itemId: string) => {
    if (!isAdmin) return;

    const updatedOrders = orders.map(order => {
      if (order.id === orderId) {
        return {
          ...order,
          items: order.items.map(item => {
            if (item.id === itemId) {
              // Mark as completed and update delivered quantities
              const completed = !item.completed;
              const delivered = completed ? item.quantity : 0;
              return { ...item, completed, delivered };
            }
            return item;
          })
        };
      }
      return order;
    });

    setOrders(updatedOrders);
    localStorage.setItem('progressOrders', JSON.stringify(updatedOrders));

    toast({
      title: "Item Status Updated",
      description: "Delivery quantities have been adjusted according to completion status.",
    });
  };

  // Check if all items in an order are completed
  const areAllItemsCompleted = (order: Order) => {
    return order.items.every(item => item.completed);
  };

  // Mark order as complete and move to processing
  const completeOrder = async (orderId: string) => {
    if (!isAdmin) return;

    const orderToComplete = orders.find(order => order.id === orderId);
    if (!orderToComplete) return;

    if (!areAllItemsCompleted(orderToComplete)) {
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
      fetchSupabaseOrders();
    } catch (error: any) {
      console.error('Error completing order:', error);
      toast({
        title: "Error",
        description: "Failed to complete order. Please try again.",
        variant: "destructive",
      });
    }
  };

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

      {/* In-Progress Orders */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold">Orders In Progress</h2>
        </div>
        <div className="divide-y">
          {orders.filter(order => 
            order.status === 'received' || order.status === 'in-progress'
          ).length === 0 && (
            <div className="p-4 text-center text-gray-500">
              No orders in progress.
            </div>
          )}
          
          {orders
            .filter(order => order.status === 'received' || order.status === 'in-progress')
            .map(order => (
              <div 
                key={order.id} 
                className="p-4 hover:bg-gray-50 cursor-pointer"
                onClick={() => viewOrderDetails(order)}
              >
                <div className="space-y-2">
                  <div className="flex justify-between">
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
                        Due: {format(order.dueDate, 'MMM d, yyyy')}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>Progress:</span>
                      <span>
                        {progressStages.find(s => s.id === order.progressStage)?.name || 'Not started'}
                      </span>
                    </div>
                    <Progress value={order.progress || 0} className="h-2" />
                  </div>

                  {isAdmin && (
                    <div className="flex justify-end space-x-2 pt-2">
                      {progressStages.map((stage) => (
                        <Button 
                          key={stage.id} 
                          variant={order.progressStage === stage.id ? "default" : "outline"}
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            updateProgressStage(order.id, stage.id);
                          }}
                        >
                          {stage.name}
                        </Button>
                      ))}
                    </div>
                  )}
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
                      <p className="text-sm text-gray-500">Due Date</p>
                      <p>{format(selectedOrder.dueDate, 'MMM d, yyyy')}</p>
                    </div>
                  </div>
                </div>
                <div className="col-span-2">
                  <p className="text-sm text-gray-500">Progress</p>
                  <div className="flex items-center space-x-2">
                    <Progress value={selectedOrder.progress || 0} className="flex-grow h-2" />
                    <span>{selectedOrder.progress || 0}%</span>
                  </div>
                </div>
              </div>

              {isAdmin && (
                <div className="flex justify-start space-x-2">
                  {progressStages.map((stage) => (
                    <Button 
                      key={stage.id} 
                      variant={selectedOrder.progressStage === stage.id ? "default" : "outline"}
                      onClick={() => updateProgressStage(selectedOrder.id, stage.id)}
                    >
                      {stage.name}
                    </Button>
                  ))}
                </div>
              )}
              
              <div>
                <h3 className="font-medium mb-2">Items</h3>
                <div className="border rounded-md divide-y">
                  {selectedOrder.items.map((item) => (
                    <div key={item.id} className="p-3 flex justify-between items-center">
                      <div>
                        <p>{item.name}</p>
                        <p className="text-sm text-gray-500">
                          Ordered: {item.quantity}
                        </p>
                      </div>
                      <div className="flex items-center space-x-2">
                        {isAdmin && (
                          <div className="flex items-center">
                            <label className="text-sm mr-2">Delivered:</label>
                            <Input
                              className="w-20"
                              type="number"
                              min="0"
                              max={item.quantity}
                              value={item.delivered || 0}
                              onChange={(e) => updateItemDelivery(
                                selectedOrder.id, 
                                item.id, 
                                parseInt(e.target.value) || 0
                              )}
                            />
                          </div>
                        )}
                        {!isAdmin && item.delivered !== undefined && (
                          <div className="text-sm">
                            Delivered: {item.delivered}
                          </div>
                        )}
                        <div className="flex items-center">
                          <label className="inline-flex items-center cursor-pointer mr-2">
                            <span className="mr-2 text-sm font-medium">Complete</span>
                            <input
                              type="checkbox"
                              checked={item.completed}
                              onChange={() => isAdmin && toggleItemCompletion(selectedOrder.id, item.id)}
                              disabled={!isAdmin}
                              className="rounded border-gray-300 text-aleph-green focus:ring-aleph-green"
                            />
                          </label>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {isAdmin && (
                <div className="flex justify-between pt-4">
                  <div className="text-sm text-gray-500">
                    <p>Note: Completing this order will move it to Processing for all users.</p>
                    <p>All items must be marked as complete before the order can be completed.</p>
                  </div>
                  <Button 
                    onClick={() => completeOrder(selectedOrder.id)}
                    disabled={!areAllItemsCompleted(selectedOrder)}
                  >
                    Complete Order
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
