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
import { Checkbox } from "@/components/ui/checkbox";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  delivered: number;
  completed: boolean;
  stock_status: 'awaiting' | 'ordered' | 'in-stock';
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

// Parse order items from description - enhanced to handle stock status
const parseOrderItems = (description: string | null): OrderItem[] => {
  if (!description) {
    return [];
  }

  const items = description.split('\n').map((line, index) => {
    // Try enhanced format with stock status: "Item Name (Qty: 2) [Delivered: 1] [Stock: ordered] [Status: completed]"
    const enhancedMatch = line.match(/^(.+?)\s*\(Qty:\s*(\d+)\)(?:\s*\[Delivered:\s*(\d+)\])?(?:\s*\[Stock:\s*(awaiting|ordered|in-stock)\])?(?:\s*\[Status:\s*(completed|pending)\])?/);
    if (enhancedMatch) {
      return {
        id: `item-${index}`,
        name: enhancedMatch[1].trim(),
        quantity: parseInt(enhancedMatch[2]),
        delivered: enhancedMatch[3] ? parseInt(enhancedMatch[3]) : 0,
        stock_status: (enhancedMatch[4] as 'awaiting' | 'ordered' | 'in-stock') || 'awaiting',
        completed: enhancedMatch[5] === 'completed'
      };
    }
    
    // Fallback to basic format
    const basicMatch = line.match(/^(.+?)\s*\(Qty:\s*(\d+)\)$/);
    if (basicMatch) {
      return {
        id: `item-${index}`,
        name: basicMatch[1].trim(),
        quantity: parseInt(basicMatch[2]),
        delivered: 0,
        stock_status: 'awaiting' as const,
        completed: false
      };
    }
    
    // Fallback for items without quantity format
    if (line.trim()) {
      return {
        id: `item-${index}`,
        name: line.trim(),
        quantity: 1,
        delivered: 0,
        stock_status: 'awaiting' as const,
        completed: false
      };
    }
    return null;
  }).filter((item): item is OrderItem => item !== null && item.name.length > 0);

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
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (order?.description) {
      const parsedItems = parseOrderItems(order.description);
      setItems(parsedItems);

      const initialDeliveredQuantities: { [key: string]: number } = {};
      parsedItems.forEach(item => {
        initialDeliveredQuantities[item.name] = item.delivered || 0;
      });
      setDeliveredQuantities(initialDeliveredQuantities);

      setAllCompleted(parsedItems.every(item => item.completed));
    }
  }, [order]);

  const updateDeliveredQuantity = (itemName: string, quantity: number) => {
    setDeliveredQuantities(prev => ({
      ...prev,
      [itemName]: quantity
    }));
  };

  const updateStockStatus = (itemName: string, status: 'awaiting' | 'ordered' | 'in-stock') => {
    setItems(prevItems =>
      prevItems.map(item =>
        item.name === itemName ? { ...item, stock_status: status } : item
      )
    );
  };

  const toggleItemCompletion = (itemName: string, completed: boolean) => {
    setItems(prevItems =>
      prevItems.map(item =>
        item.name === itemName ? { ...item, completed } : item
      )
    );
  };

  const getStockStatusBadge = (status: 'awaiting' | 'ordered' | 'in-stock') => {
    switch (status) {
      case 'awaiting':
        return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">Awaiting</Badge>;
      case 'ordered':
        return <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">Ordered</Badge>;
      case 'in-stock':
        return <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">In Stock</Badge>;
      default:
        return <Badge variant="secondary">Unknown</Badge>;
    }
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

    setSaving(true);

    try {
      const updatedItems = items.map(item => ({
        ...item,
        delivered: deliveredQuantities[item.name] || 0,
      }));

      // Convert items back to description format including stock status
      const description = updatedItems.map(item => {
        let itemString = `${item.name} (Qty: ${item.quantity})`;
        if (item.delivered !== undefined && item.delivered > 0) {
          itemString += ` [Delivered: ${item.delivered}]`;
        }
        itemString += ` [Stock: ${item.stock_status}]`;
        if (item.completed) {
          itemString += ` [Status: completed]`;
        }
        return itemString;
      }).join('\n');

      const allItemsCompleted = updatedItems.every(item => item.completed);
      const newStatus = allItemsCompleted ? 'completed' : order.status;
      const updateData: any = {
        description,
        status: newStatus,
        updated_at: new Date().toISOString()
      };

      if (allItemsCompleted && order.status !== 'completed') {
        updateData.completed_date = new Date().toISOString();
      }

      const { error } = await supabase
        .from('orders')
        .update(updateData)
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
        description: allItemsCompleted ? "Order marked as completed!" : "Order updated successfully.",
      });
      onClose();
    } catch (error) {
      console.error("Unexpected error:", error);
      toast({
        title: "Error",
        description: "Unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (!order) {
    return null;
  }

  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>Order #{order?.order_number || 'Unknown'} Details</AlertDialogTitle>
        </AlertDialogHeader>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Order Number</p>
            <p className="font-medium">{order?.order_number || 'Unknown'}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Company</p>
            <p className="font-medium">{order?.companyName || 'Unknown Company'}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Created At</p>
            <p className="font-medium">{formatSafeDate(order?.created_at)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Status</p>
            <Badge variant="secondary">{order?.status || 'Unknown'}</Badge>
          </div>
        </div>

        <div className="mt-6">
          <h3 className="text-xl font-semibold mb-4">Items & Stock Status</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Item
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Qty
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Ordered
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Received
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Delivered
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Completed
                  </th>
                </tr>
              </thead>
              <tbody className="bg-card divide-y divide-border">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-4 text-center text-muted-foreground">
                      No items found for this order
                    </td>
                  </tr>
                ) : (
                  items.map((item) => (
                    <tr key={item.name} className="hover:bg-muted/30">
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium">
                        {item.name}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-muted-foreground">
                        {item.quantity}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        <Checkbox
                          checked={item.stock_status === 'ordered'}
                          onCheckedChange={(checked) => {
                            if (checked) updateStockStatus(item.name, 'ordered');
                            else updateStockStatus(item.name, 'awaiting');
                          }}
                          disabled={!isAdmin}
                          className="data-[state=checked]:bg-blue-500 data-[state=checked]:border-blue-500"
                        />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        <Checkbox
                          checked={item.stock_status === 'in-stock'}
                          onCheckedChange={(checked) => {
                            if (checked) updateStockStatus(item.name, 'in-stock');
                            else updateStockStatus(item.name, 'awaiting');
                          }}
                          disabled={!isAdmin}
                          className="data-[state=checked]:bg-green-500 data-[state=checked]:border-green-500"
                        />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        {isAdmin ? (
                          <input
                            type="number"
                            value={deliveredQuantities[item.name] || 0}
                            onChange={(e) =>
                              updateDeliveredQuantity(item.name, parseInt(e.target.value) || 0)
                            }
                            className="w-20 px-2 py-1 text-sm border rounded-md bg-background border-input focus:ring-2 focus:ring-ring"
                            min="0"
                            max={item.quantity}
                          />
                        ) : (
                          <span className="font-medium">
                            {deliveredQuantities[item.name] || 0}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        {isAdmin ? (
                          <Checkbox
                            checked={item.completed}
                            onCheckedChange={(checked) =>
                              toggleItemCompletion(item.name, checked as boolean)
                            }
                          />
                        ) : (
                          <Badge variant={item.completed ? "default" : "secondary"}>
                            {item.completed ? "Done" : "Pending"}
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          
          {/* Stock Status Legend */}
          <div className="mt-4 flex flex-wrap gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-blue-500"></div>
              <span>Ordered</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-green-500"></div>
              <span>Received/In Stock</span>
            </div>
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose} disabled={saving}>
            {isAdmin ? "Cancel" : "Close"}
          </AlertDialogCancel>
          {isAdmin && (
            <AlertDialogAction onClick={saveChanges} disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
