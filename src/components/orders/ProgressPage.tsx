
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { format } from "date-fns";

// Define the order item interface
interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  delivered?: number;
  completed: boolean;
}

// Define the order interface
interface Order {
  id: string;
  orderNumber: string;
  companyName: string;
  orderDate: Date;
  dueDate: Date;
  items: OrderItem[];
  status: 'pending' | 'received' | 'in-progress' | 'processing' | 'completed';
  progress?: number;
  progressStage?: 'awaiting-stock' | 'packing' | 'out-for-delivery' | 'completed';
}

interface ProgressPageProps {
  isAdmin: boolean;
}

export default function ProgressPage({ isAdmin }: ProgressPageProps) {
  const { toast } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

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

    setOrders(orders.map(order => {
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
    }));
  };

  const toggleItemCompletion = (orderId: string, itemId: string) => {
    if (!isAdmin) return;

    setOrders(orders.map(order => {
      if (order.id === orderId) {
        return {
          ...order,
          items: order.items.map(item => {
            if (item.id === itemId) {
              return { ...item, completed: !item.completed };
            }
            return item;
          })
        };
      }
      return order;
    }));
  };

  // Check if all items in an order are completed
  const areAllItemsCompleted = (order: Order) => {
    return order.items.every(item => item.completed);
  };

  // Mark order as complete and move to processing
  const completeOrder = (orderId: string) => {
    if (!isAdmin) return;

    setOrders(orders.map(order => {
      if (order.id === orderId) {
        if (!areAllItemsCompleted(order)) {
          toast({
            title: "Cannot Complete Order",
            description: "All items must be marked as complete first.",
            variant: "destructive",
          });
          return order;
        }
        return {
          ...order,
          status: 'processing',
          progress: 100,
          progressStage: 'completed'
        };
      }
      return order;
    }));

    toast({
      title: "Order Completed",
      description: "Order has been moved to processing.",
    });
  };

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Order Progress Tracking</h1>
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
                      <h3 className="font-medium">Order #{order.orderNumber}</h3>
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
              <DialogTitle>Order #{selectedOrder.orderNumber} Details</DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Company</p>
                  <p>{selectedOrder.companyName}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Order Date</p>
                  <p>{format(selectedOrder.orderDate, 'MMM d, yyyy')}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Due Date</p>
                  <p>{format(selectedOrder.dueDate, 'MMM d, yyyy')}</p>
                </div>
                <div>
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
                            <input
                              className="w-20 border rounded px-2 py-1"
                              type="number"
                              placeholder="Delivered"
                              value={item.delivered || ""}
                              onChange={(e) => updateItemDelivery(
                                selectedOrder.id, 
                                item.id, 
                                parseInt(e.target.value) || 0
                              )}
                            />
                          </div>
                        )}
                        {item.delivered && (
                          <div className="text-sm">
                            Delivered: {item.delivered}
                          </div>
                        )}
                        <div>
                          <input
                            type="checkbox"
                            checked={item.completed}
                            onChange={() => isAdmin && toggleItemCompletion(selectedOrder.id, item.id)}
                            disabled={!isAdmin}
                            className="ml-2"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {isAdmin && (
                <div className="flex justify-end">
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
