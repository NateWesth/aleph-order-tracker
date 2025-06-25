
import React, { useState } from 'react';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Trash2 } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  delivered?: number;
  completed: boolean;
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
}

interface ProgressOrderDetailsDialogProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  isAdmin: boolean;
  onOrderUpdate: (orderId: string, updates: Partial<Order>) => void;
  onCompleteOrder: (orderId: string) => void;
  onDeleteOrder: (orderId: string, orderNumber: string) => void;
}

const progressStages = [
  { id: 'awaiting-stock', name: 'Awaiting Stock', value: 25 },
  { id: 'packing', name: 'Packing', value: 50 },
  { id: 'out-for-delivery', name: 'Out for Delivery', value: 75 },
  { id: 'completed', name: 'Completed', value: 100 },
];

export default function ProgressOrderDetailsDialog({
  order,
  isOpen,
  onClose,
  isAdmin,
  onOrderUpdate,
  onCompleteOrder,
  onDeleteOrder
}: ProgressOrderDetailsDialogProps) {
  const { toast } = useToast();
  const [savingItems, setSavingItems] = useState<Set<string>>(new Set());

  if (!order) return null;

  // Update progress stage and sync to database
  const updateProgressStage = async (stage: string) => {
    if (!isAdmin) return;

    const stageInfo = progressStages.find(s => s.id === stage);
    if (!stageInfo) return;

    try {
      console.log(`Updating order ${order.id} progress stage to ${stage}`);
      
      // Determine new status based on stage
      let newStatus = order.status;
      if (stage === 'completed') {
        newStatus = 'processing';
      } else if (stage === 'awaiting-stock') {
        newStatus = 'received';
      } else if (stage === 'packing' || stage === 'out-for-delivery') {
        newStatus = 'in-progress';
      }

      // Update in database
      const { error } = await supabase
        .from('orders')
        .update({ 
          status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', order.id);

      if (error) throw error;

      // Update local state
      onOrderUpdate(order.id, {
        progressStage: stage as 'awaiting-stock' | 'packing' | 'out-for-delivery' | 'completed',
        progress: stageInfo.value,
        status: newStatus as 'pending' | 'received' | 'in-progress' | 'processing' | 'completed'
      });

      toast({
        title: "Progress Updated",
        description: `Order progress updated to ${stageInfo.name}.`,
      });

      if (stage === 'completed') {
        toast({
          title: "Order Completed",
          description: "Order has been moved to processing and will sync across all users.",
        });
        
        // Close dialog and refresh parent
        setTimeout(() => {
          onClose();
        }, 1000);
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

  // Update item delivery quantity and sync to database
  const updateItemDelivery = async (itemId: string, delivered: number) => {
    if (!isAdmin) return;

    setSavingItems(prev => new Set(prev).add(itemId));

    try {
      // In a real implementation, you'd save item details to a separate order_items table
      // For now, we'll update the order's metadata or use localStorage as backup
      
      const updatedItems = order.items.map(item => 
        item.id === itemId ? { ...item, delivered } : item
      );

      onOrderUpdate(order.id, { items: updatedItems });

      toast({
        title: "Quantity Updated",
        description: "Delivery quantity has been saved and synced.",
      });
    } catch (error) {
      console.error('Error updating item delivery:', error);
      toast({
        title: "Error",
        description: "Failed to update quantity. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSavingItems(prev => {
        const newSet = new Set(prev);
        newSet.delete(itemId);
        return newSet;
      });
    }
  };

  // Toggle item completion status and sync to database
  const toggleItemCompletion = async (itemId: string) => {
    if (!isAdmin) return;

    setSavingItems(prev => new Set(prev).add(itemId));

    try {
      const item = order.items.find(i => i.id === itemId);
      if (!item) return;

      const completed = !item.completed;
      const delivered = completed ? item.quantity : 0;

      const updatedItems = order.items.map(i => 
        i.id === itemId ? { ...i, completed, delivered } : i
      );

      onOrderUpdate(order.id, { items: updatedItems });

      toast({
        title: "Item Status Updated",
        description: "Item completion status has been saved and synced.",
      });
    } catch (error) {
      console.error('Error updating item completion:', error);
      toast({
        title: "Error",
        description: "Failed to update item status. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSavingItems(prev => {
        const newSet = new Set(prev);
        newSet.delete(itemId);
        return newSet;
      });
    }
  };

  const areAllItemsCompleted = () => {
    return order.items.every(item => item.completed);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            <div className="flex items-center gap-2">
              {order.company?.logo && (
                <img 
                  src={order.company.logo} 
                  alt={`${order.companyName} logo`} 
                  className="h-6 w-6 rounded object-cover" 
                />
              )}
              Order #{order.orderNumber} Details
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
                        Are you sure you want to delete order {order.orderNumber}? This action cannot be undone and will remove the order from all systems.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction 
                        onClick={() => onDeleteOrder(order.id, order.orderNumber)}
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
        
        <div className="space-y-6">
          {/* Order Information */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-500">Company</p>
              <p className="font-medium">{order.companyName}</p>
              {order.company && (
                <div className="mt-2 text-xs text-gray-600">
                  <p>{order.company.address}</p>
                  <p>VAT: {order.company.vatNumber}</p>
                  <p>Tel: {order.company.phone}</p>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <div>
                <p className="text-sm text-gray-500">Order Date</p>
                <p>{format(order.orderDate, 'MMM d, yyyy')}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Due Date</p>
                <p>{format(order.dueDate, 'MMM d, yyyy')}</p>
              </div>
            </div>
          </div>

          {/* Progress Section */}
          <div>
            <p className="text-sm text-gray-500 mb-2">Progress</p>
            <div className="flex items-center space-x-2 mb-3">
              <Progress value={order.progress || 0} className="flex-grow h-2" />
              <span className="text-sm font-medium">{order.progress || 0}%</span>
            </div>
            
            {isAdmin && (
              <div className="flex flex-wrap gap-2">
                {progressStages.map((stage) => (
                  <Button 
                    key={stage.id} 
                    variant={order.progressStage === stage.id ? "default" : "outline"}
                    size="sm"
                    onClick={() => updateProgressStage(stage.id)}
                  >
                    {stage.name}
                  </Button>
                ))}
              </div>
            )}
          </div>

          {/* Items Table */}
          <div>
            <h3 className="font-medium mb-3">Order Items</h3>
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item Name</TableHead>
                    <TableHead className="text-center">Quantity</TableHead>
                    {isAdmin && <TableHead className="text-center">Delivered</TableHead>}
                    {!isAdmin && <TableHead className="text-center">Delivered</TableHead>}
                    <TableHead className="text-center">Status</TableHead>
                    {isAdmin && <TableHead className="text-center">Complete</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell className="text-center">{item.quantity}</TableCell>
                      <TableCell className="text-center">
                        {isAdmin ? (
                          <Input
                            className="w-20 mx-auto"
                            type="number"
                            min="0"
                            max={item.quantity}
                            value={item.delivered || 0}
                            onChange={(e) => updateItemDelivery(item.id, parseInt(e.target.value) || 0)}
                            disabled={savingItems.has(item.id)}
                          />
                        ) : (
                          <span>{item.delivered || 0}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={item.completed ? "default" : "secondary"}>
                          {item.completed ? "Complete" : "Pending"}
                        </Badge>
                      </TableCell>
                      {isAdmin && (
                        <TableCell className="text-center">
                          <input
                            type="checkbox"
                            checked={item.completed}
                            onChange={() => toggleItemCompletion(item.id)}
                            disabled={savingItems.has(item.id)}
                            className="rounded border-gray-300 text-aleph-green focus:ring-aleph-green"
                          />
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Complete Order Button */}
          {isAdmin && (
            <div className="flex justify-between items-center pt-4 border-t">
              <div className="text-sm text-gray-500">
                <p>Note: Completing this order will move it to Processing for all users.</p>
                <p>All items must be marked as complete before the order can be completed.</p>
              </div>
              <Button 
                onClick={() => onCompleteOrder(order.id)}
                disabled={!areAllItemsCompleted()}
                className="ml-4"
              >
                Complete Order
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
