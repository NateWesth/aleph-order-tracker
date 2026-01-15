import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { OrderWithCompany } from "../types/orderTypes";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Trash2, Edit2, X } from "lucide-react";

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  notes: string;
  stock_status: 'awaiting' | 'ordered' | 'in-stock';
  delivered: number;
  completed: boolean;
}

interface OrderDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: OrderWithCompany;
  isAdmin?: boolean;
  onSave?: () => void;
}

// Parse stock status from description line
const parseStockStatusFromLine = (line: string): 'awaiting' | 'ordered' | 'in-stock' => {
  const stockMatch = line.match(/\[Stock:\s*(awaiting|ordered|in-stock)\]/);
  return (stockMatch?.[1] as 'awaiting' | 'ordered' | 'in-stock') || 'awaiting';
};

// Parse delivered quantity from description line
const parseDeliveredFromLine = (line: string): number => {
  const deliveredMatch = line.match(/\[Delivered:\s*(\d+)\]/);
  return deliveredMatch ? parseInt(deliveredMatch[1]) : 0;
};

// Parse completed status from description line
const parseCompletedFromLine = (line: string): boolean => {
  return line.includes('[Status: completed]');
};

export default function OrderDetailsDialog({
  open,
  onOpenChange,
  order,
  isAdmin = false,
  onSave
}: OrderDetailsDialogProps) {
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [editableItems, setEditableItems] = useState<OrderItem[]>([]);
  const [fetchedItems, setFetchedItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchingItems, setFetchingItems] = useState(false);

  // Parse items from description with stock status
  const parseItemsFromDescription = (description: string | null): OrderItem[] => {
    if (!description) return [];
    
    return description.split('\n').map((line, index) => {
      const qtyMatch = line.match(/^(.+?)\s*\(Qty:\s*(\d+)\)/);
      if (qtyMatch) {
        return {
          id: `item-${index}`,
          name: qtyMatch[1].trim(),
          quantity: parseInt(qtyMatch[2]),
          unit: 'pcs',
          notes: '',
          stock_status: parseStockStatusFromLine(line),
          delivered: parseDeliveredFromLine(line),
          completed: parseCompletedFromLine(line)
        };
      }
      if (line.trim()) {
        return {
          id: `item-${index}`,
          name: line.trim(),
          quantity: 1,
          unit: 'pcs',
          notes: '',
          stock_status: 'awaiting' as const,
          delivered: 0,
          completed: false
        };
      }
      return null;
    }).filter((item): item is OrderItem => item !== null);
  };

  // Fetch order items from database when dialog opens
  useEffect(() => {
    const fetchOrderItems = async () => {
      if (!open || !order?.id) return;
      
      setFetchingItems(true);
      try {
        const { data, error } = await supabase
          .from('order_items')
          .select('*')
          .eq('order_id', order.id)
          .order('created_at', { ascending: true });

        if (error) throw error;

        if (data && data.length > 0) {
          setFetchedItems(data.map(item => ({
            id: item.id,
            name: item.name,
            quantity: item.quantity,
            unit: 'pcs',
            notes: item.notes || '',
            stock_status: (item.stock_status as 'awaiting' | 'ordered' | 'in-stock') || 'awaiting',
            delivered: 0,
            completed: false
          })));
        } else {
          // Fallback to parsing description if no order_items exist
          setFetchedItems(parseItemsFromDescription(order.description));
        }
      } catch (error) {
        console.error('Error fetching order items:', error);
        setFetchedItems(parseItemsFromDescription(order.description));
      } finally {
        setFetchingItems(false);
      }
    };

    fetchOrderItems();
  }, [open, order?.id, order?.description]);

  const getStatusColor = (status: string | null) => {
    switch (status?.toLowerCase()) {
      case 'completed':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'processing':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case 'received':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    }
  };

  const getUrgencyColor = (urgency: string | undefined) => {
    switch (urgency?.toLowerCase()) {
      case 'high':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
      case 'medium':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300';
      case 'low':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 text-gray-300';
    }
  };

  // Update stock status for an item
  const updateStockStatus = (itemId: string, status: 'awaiting' | 'ordered' | 'in-stock') => {
    const items = isEditing ? editableItems : fetchedItems;
    const setItems = isEditing ? setEditableItems : setFetchedItems;
    setItems(items.map(item =>
      item.id === itemId ? { ...item, stock_status: status } : item
    ));
  };

  // Initialize editable items when entering edit mode
  useEffect(() => {
    if (isEditing) {
      const itemsToEdit = fetchedItems.length > 0 ? fetchedItems : parseItemsFromDescription(order.description);
      setEditableItems(itemsToEdit.map((item, idx) => ({
        id: item.id || `item-${idx}`,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        notes: item.notes,
        stock_status: item.stock_status || 'awaiting',
        delivered: item.delivered || 0,
        completed: item.completed || false
      })));
    }
  }, [isEditing, fetchedItems, order.description]);

  const addItem = () => {
    const newItem: OrderItem = {
      id: `item-${Date.now()}`,
      name: '',
      quantity: 1,
      unit: 'pcs',
      notes: '',
      stock_status: 'awaiting',
      delivered: 0,
      completed: false
    };
    setEditableItems(prev => [...prev, newItem]);
  };

  const removeItem = (itemId: string) => {
    setEditableItems(prev => prev.filter(item => item.id !== itemId));
  };

  const updateItemField = (itemId: string, field: keyof OrderItem, value: any) => {
    setEditableItems(prev =>
      prev.map(item =>
        item.id === itemId ? { ...item, [field]: value } : item
      )
    );
  };

  const handleSave = async () => {
    const itemsToSave = isEditing ? editableItems : fetchedItems;
    const validItems = itemsToSave.filter(item => item.name.trim() !== '');
    
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
      // Convert items to description format with stock status
      const description = validItems.map(item => {
        let line = `${item.name.trim()} (Qty: ${item.quantity})`;
        if (item.delivered > 0) {
          line += ` [Delivered: ${item.delivered}]`;
        }
        line += ` [Stock: ${item.stock_status}]`;
        if (item.completed) {
          line += ` [Status: completed]`;
        }
        return line;
      }).join('\n');

      const { error } = await supabase
        .from('orders')
        .update({
          description,
          updated_at: new Date().toISOString()
        })
        .eq('id', order.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Order updated successfully.",
      });
      
      setIsEditing(false);
      if (onSave) onSave();
    } catch (error: any) {
      console.error("Error updating order:", error);
      toast({
        title: "Error",
        description: "Failed to update order: " + error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditableItems([]);
  };

  // Use fetched items from database, fallback to parsing description
  const displayItems = isEditing ? editableItems : (fetchedItems.length > 0 ? fetchedItems : parseItemsFromDescription(order.description));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Order Details - {order.order_number}</DialogTitle>
            {isAdmin && !isEditing && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditing(true)}
              >
                <Edit2 className="h-4 w-4 mr-2" />
                Edit Items
              </Button>
            )}
          </div>
        </DialogHeader>
        
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Company</p>
              <p className="font-medium">{order.companyName || 'No Company'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Order Date</p>
              <p>{new Date(order.created_at).toLocaleDateString()}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Status</p>
              <Badge className={getStatusColor(order.status)}>
                {order.status || 'pending'}
              </Badge>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Urgency</p>
              <Badge className={getUrgencyColor(order.urgency)}>
                {order.urgency || 'normal'}
              </Badge>
            </div>
          </div>

          {order.notes && (
            <div>
              <p className="text-sm text-muted-foreground mb-2">Order Notes</p>
              <div className="bg-muted/50 p-3 rounded-md">
                <p className="text-sm whitespace-pre-wrap">{order.notes}</p>
              </div>
            </div>
          )}
          
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium text-lg">Order Items & Stock Status</h3>
              {isEditing && (
                <Button type="button" variant="outline" size="sm" onClick={addItem}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Item
                </Button>
              )}
            </div>
            
            {displayItems.length === 0 ? (
              <div className="text-center p-8 border rounded-md border-dashed">
                <p className="text-muted-foreground">
                  {isEditing ? 'No items. Click "Add Item" to create one.' : 'No items found in this order.'}
                </p>
              </div>
            ) : isEditing ? (
              <div className="space-y-3">
                {displayItems.map((item) => (
                  <div key={item.id} className="flex items-start gap-3 p-3 border rounded-lg">
                    <div className="flex-1 space-y-2">
                      <Input
                        placeholder="Item name"
                        value={item.name}
                        onChange={(e) => updateItemField(item.id, 'name', e.target.value)}
                      />
                      <Input
                        placeholder="Notes (optional)"
                        value={item.notes || ''}
                        onChange={(e) => updateItemField(item.id, 'notes', e.target.value)}
                      />
                    </div>
                    <Input
                      type="number"
                      placeholder="Qty"
                      value={item.quantity}
                      onChange={(e) => updateItemField(item.id, 'quantity', Math.max(1, parseInt(e.target.value) || 1))}
                      min="1"
                      className="w-20"
                    />
                    <div className="flex flex-col gap-1">
                      <label className="flex items-center gap-1 text-xs">
                        <Checkbox
                          checked={item.stock_status === 'awaiting'}
                          onCheckedChange={(checked) => {
                            if (checked) updateItemField(item.id, 'stock_status', 'awaiting');
                          }}
                          className="data-[state=checked]:bg-yellow-500 data-[state=checked]:border-yellow-500"
                        />
                        Awaiting
                      </label>
                      <label className="flex items-center gap-1 text-xs">
                        <Checkbox
                          checked={item.stock_status === 'ordered'}
                          onCheckedChange={(checked) => {
                            if (checked) updateItemField(item.id, 'stock_status', 'ordered');
                          }}
                          className="data-[state=checked]:bg-blue-500 data-[state=checked]:border-blue-500"
                        />
                        Ordered
                      </label>
                      <label className="flex items-center gap-1 text-xs">
                        <Checkbox
                          checked={item.stock_status === 'in-stock'}
                          onCheckedChange={(checked) => {
                            if (checked) updateItemField(item.id, 'stock_status', 'in-stock');
                          }}
                          className="data-[state=checked]:bg-green-500 data-[state=checked]:border-green-500"
                        />
                        Received
                      </label>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => removeItem(item.id)}
                      className="text-red-600 hover:text-red-700 shrink-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Item</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase">Qty</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase">Awaiting</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase">Ordered</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase">Received</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {displayItems.map((item) => (
                        <tr key={item.id} className="hover:bg-muted/30">
                          <td className="px-4 py-3 text-sm font-medium">{item.name}</td>
                          <td className="px-4 py-3 text-center text-sm text-muted-foreground">{item.quantity}</td>
                          <td className="px-4 py-3 text-center">
                            <Checkbox
                              checked={item.stock_status === 'awaiting'}
                              onCheckedChange={(checked) => {
                                if (checked && isAdmin) updateStockStatus(item.id, 'awaiting');
                              }}
                              disabled={!isAdmin}
                              className="data-[state=checked]:bg-yellow-500 data-[state=checked]:border-yellow-500"
                            />
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Checkbox
                              checked={item.stock_status === 'ordered'}
                              onCheckedChange={(checked) => {
                                if (checked && isAdmin) updateStockStatus(item.id, 'ordered');
                              }}
                              disabled={!isAdmin}
                              className="data-[state=checked]:bg-blue-500 data-[state=checked]:border-blue-500"
                            />
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Checkbox
                              checked={item.stock_status === 'in-stock'}
                              onCheckedChange={(checked) => {
                                if (checked && isAdmin) updateStockStatus(item.id, 'in-stock');
                              }}
                              disabled={!isAdmin}
                              className="data-[state=checked]:bg-green-500 data-[state=checked]:border-green-500"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                
                {/* Stock Status Legend */}
                <div className="mt-4 flex flex-wrap gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded bg-yellow-500"></div>
                    <span>Awaiting Stock</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded bg-blue-500"></div>
                    <span>Ordered</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded bg-green-500"></div>
                    <span>Received/In Stock</span>
                  </div>
                </div>

                {/* Save button for stock status changes (admins only) */}
                {isAdmin && (
                  <div className="mt-4 flex justify-end">
                    <Button onClick={handleSave} disabled={loading}>
                      {loading ? "Saving..." : "Save Stock Status"}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {isEditing && (
          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={loading}
            >
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={loading}
            >
              {loading ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
