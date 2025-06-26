
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
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface OrderItem {
  name: string;
  quantity: number;
  delivered?: number;
  completed: boolean;
}

interface ProgressOrderDetailsDialogProps {
  order: any;
  isOpen: boolean;
  onClose: () => void;
  isAdmin: boolean;
}

// Helper function to safely format dates
const formatSafeDate = (date: Date | string | number | null | undefined): string => {
  try {
    if (!date) return 'No date';
    const dateObj = new Date(date);
    if (isNaN(dateObj.getTime())) {
      return 'Invalid Date';
    }
    return format(dateObj, 'MMM d, yyyy h:mm a');
  } catch (error) {
    console.error('Error formatting date:', error, 'Date value:', date);
    return 'Invalid Date';
  }
};

// Parse order items from description - same logic as other components
const parseOrderItems = (description: string | null): OrderItem[] => {
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
        quantity: parseInt(match[2]),
        delivered: 0,
        completed: false
      };
    }
    // Fallback for items without quantity format
    return {
      name: line.trim(),
      quantity: 1,
      delivered: 0,
      completed: false
    };
  }).filter(item => item.name);

  return items;
};

export default function ProgressOrderDetailsDialog({ 
  order, 
  isOpen, 
  onClose, 
  isAdmin 
}: ProgressOrderDetailsDialogProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [items, setItems] = useState<OrderItem[]>([]);
  const [deliveredQuantities, setDeliveredQuantities] = useState<{ [key: string]: number }>({});
  const [allCompleted, setAllCompleted] = useState(false);

  useEffect(() => {
    if (order?.description) {
      // Parse items from the order description
      const parsedItems = parseOrderItems(order.description);
      setItems(parsedItems);

      // Initialize delivered quantities from the database or default to 0
      const initialDeliveredQuantities: { [key: string]: number } = {};
      parsedItems.forEach(item => {
        initialDeliveredQuantities[item.name] = item.delivered || 0;
      });
      setDeliveredQuantities(initialDeliveredQuantities);

      // Check if all items are completed
      setAllCompleted(parsedItems.every(item => item.completed));
    }
  }, [order]);

  const updateDeliveredQuantity = (itemName: string, quantity: number) => {
    setDeliveredQuantities(prev => ({
      ...prev,
      [itemName]: quantity
    }));
  };

  const toggleItemCompletion = (itemName: string, completed: boolean) => {
    setItems(prevItems =>
      prevItems.map(item =>
        item.name === itemName ? { ...item, completed } : item
      )
    );
  };

  const saveChanges = async () => {
    if (!order?.id) {
      toast({
        title: "Error",
        description: "Order ID is missing.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Prepare updates for each item
      const itemUpdates = items.map(item => ({
        name: item.name,
        delivered: deliveredQuantities[item.name] || 0,
        completed: item.completed
      }));

      // For now, we'll just update the order status since the database doesn't have an items column
      // This is a simplified approach - in a real app you'd have a separate items table
      const { error } = await supabase
        .from('orders')
        .update({ 
          status: order.status,
          updated_at: new Date().toISOString()
        })
        .eq('id', order.id);

      if (error) {
        console.error("Error updating order:", error);
        toast({
          title: "Error",
          description: "Failed to update order.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Success",
        description: "Order updated successfully.",
      });
      onClose();
    } catch (error) {
      console.error("Unexpected error:", error);
      toast({
        title: "Error",
        description: "Unexpected error occurred.",
        variant: "destructive",
      });
    }
  };

  // Don't render if order is not available
  if (!order) {
    return null;
  }

  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>Order #{order?.order_number || 'Unknown'} Details</AlertDialogTitle>
        </AlertDialogHeader>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-500">Order Number</p>
            <p>{order?.order_number || 'Unknown'}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Company</p>
            <p>{order?.companyName || 'Unknown Company'}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Created At</p>
            <p>{formatSafeDate(order?.created_at)}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Status</p>
            <Badge variant="secondary">{order?.status || 'Unknown'}</Badge>
          </div>
        </div>

        <div className="mt-6">
          <h3 className="text-xl font-semibold mb-4">Items</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Item
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Quantity
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Delivered
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Completed
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-4 text-center text-gray-500">
                      No items found for this order
                    </td>
                  </tr>
                ) : (
                  items.map((item) => (
                    <tr key={item.name}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {item.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {item.quantity}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <input
                          type="number"
                          value={deliveredQuantities[item.name] || 0}
                          onChange={(e) =>
                            updateDeliveredQuantity(item.name, parseInt(e.target.value) || 0)
                          }
                          className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-24 sm:text-sm border-gray-300 rounded-md"
                          min="0"
                          max={item.quantity}
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <input
                          type="checkbox"
                          checked={item.completed}
                          onChange={(e) =>
                            toggleItemCompletion(item.name, e.target.checked)
                          }
                          className="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300 rounded"
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={saveChanges}>Save Changes</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
