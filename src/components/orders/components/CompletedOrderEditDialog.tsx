import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Trash2, Plus } from "lucide-react";

interface Company {
  id: string;
  name: string;
  code: string;
}

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
}

interface CompletedOrderEditDialogProps {
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
      };
    }
    // Fallback for items without quantity format
    return {
      id: `item-${index}`,
      name: line.trim(),
      quantity: 1,
    };
  }).filter(item => item.name);

  return items;
};

export default function CompletedOrderEditDialog({ 
  order, 
  isOpen, 
  onClose, 
  isAdmin 
}: CompletedOrderEditDialogProps) {
  const { toast } = useToast();
  const [items, setItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
  const [orderNumber, setOrderNumber] = useState<string>('');

  // Fetch companies for selection
  const fetchCompanies = async () => {
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('id, name, code')
        .order('name');

      if (error) throw error;
      setCompanies(data || []);
    } catch (error) {
      console.error('Error fetching companies:', error);
    }
  };

  useEffect(() => {
    if (isOpen && isAdmin) {
      fetchCompanies();
    }
  }, [isOpen, isAdmin]);

  useEffect(() => {
    if (order?.description) {
      const parsedItems = parseOrderItems(order.description);
      setItems(parsedItems);
    }
    if (order?.company_id) {
      setSelectedCompanyId(order.company_id);
    }
    if (order?.order_number) {
      setOrderNumber(order.order_number);
    }
  }, [order]);

  const updateItemName = (itemId: string, name: string) => {
    setItems(prevItems =>
      prevItems.map(item =>
        item.id === itemId ? { ...item, name } : item
      )
    );
  };

  const updateItemQuantity = (itemId: string, quantity: number) => {
    setItems(prevItems =>
      prevItems.map(item =>
        item.id === itemId ? { ...item, quantity: Math.max(1, quantity) } : item
      )
    );
  };

  const removeItem = (itemId: string) => {
    setItems(prevItems => prevItems.filter(item => item.id !== itemId));
  };

  const addItem = () => {
    const newItem: OrderItem = {
      id: `item-${Date.now()}`,
      name: '',
      quantity: 1,
    };
    setItems(prevItems => [...prevItems, newItem]);
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

    // Validate items
    const validItems = items.filter(item => item.name.trim() !== '');
    if (validItems.length === 0) {
      toast({
        title: "Error", 
        description: "Please add at least one item with a name.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      // Convert items back to description format for storage
      const description = validItems.map(item => 
        `${item.name.trim()} (Qty: ${item.quantity})`
      ).join('\n');

      const updateData: any = {
        description,
        updated_at: new Date().toISOString()
      };

      // Include company_id if it was changed
      if (selectedCompanyId && selectedCompanyId !== order.company_id) {
        updateData.company_id = selectedCompanyId;
      }

      // Include order_number if it was changed
      if (orderNumber && orderNumber !== order.order_number) {
        updateData.order_number = orderNumber;
      }

      const { error } = await supabase
        .from('orders')
        .update(updateData)
        .eq('id', order.id);

      if (error) {
        console.error("Error updating order:", error);
        toast({
          title: "Error",
          description: "Failed to update order items.",
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
    } finally {
      setLoading(false);
    }
  };

  // Don't render if order is not available or user is not admin
  if (!order || !isAdmin) {
    return null;
  }

  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>Edit Order #{order?.order_number || 'Unknown'}</AlertDialogTitle>
          <AlertDialogDescription>
            Update the item descriptions and quantities for this completed order.
          </AlertDialogDescription>
        </AlertDialogHeader>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div>
            <p className="text-sm text-muted-foreground">Order Number</p>
            <Input
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              placeholder="Order number"
              className="mt-1"
            />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Company</p>
            <div className="space-y-2">
              <p className="font-medium">{order?.companyName || 'Unknown Company'}</p>
              <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Change company..." />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((company) => (
                    <SelectItem key={company.id} value={company.id}>
                      {company.name} ({company.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Created At</p>
            <p className="font-medium">{formatSafeDate(order?.created_at)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Status</p>
            <Badge variant="outline" className="bg-green-100 text-green-800">
              {order?.status || 'Unknown'}
            </Badge>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Order Items</h3>
            <Button type="button" variant="outline" size="sm" onClick={addItem}>
              <Plus className="h-4 w-4 mr-2" />
              Add Item
            </Button>
          </div>
          
          <div className="space-y-3">
            {items.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No items found. Click "Add Item" to create the first item.
              </div>
            ) : (
              items.map((item) => (
                <div key={item.id} className="flex items-center space-x-3 p-3 border border-border rounded-lg">
                  <div className="flex-1">
                    <Input
                      placeholder="Item name"
                      value={item.name}
                      onChange={(e) => updateItemName(item.id, e.target.value)}
                      className="w-full"
                    />
                  </div>
                  <div className="w-24">
                    <Input
                      type="number"
                      placeholder="Qty"
                      value={item.quantity}
                      onChange={(e) => updateItemQuantity(item.id, parseInt(e.target.value) || 1)}
                      min="1"
                      className="w-full"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => removeItem(item.id)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose} disabled={loading}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction onClick={saveChanges} disabled={loading}>
            {loading ? "Saving..." : "Save Changes"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}