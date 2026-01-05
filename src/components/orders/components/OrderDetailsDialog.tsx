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
import { OrderWithCompany } from "../types/orderTypes";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Trash2, Edit2, X } from "lucide-react";

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  unit?: string;
  notes?: string;
}

interface OrderDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: OrderWithCompany;
  isAdmin?: boolean;
  onSave?: () => void;
}

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
            notes: item.notes || ''
          })));
        } else {
          // Fallback to parsing description if no order_items exist
          setFetchedItems(order.items || []);
        }
      } catch (error) {
        console.error('Error fetching order items:', error);
        setFetchedItems(order.items || []);
      } finally {
        setFetchingItems(false);
      }
    };

    fetchOrderItems();
  }, [open, order?.id]);
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

  // Parse item data to extract name, quantity, and notes
  const parseItemData = (item: any) => {
    let fullName = item.name || '';
    let itemQuantity = item.quantity || 0;
    let itemNotes = item.notes || '';
    
    
    
    // Extract quantity from name if present and update the quantity
    const qtyMatch = fullName.match(/\(Qty:\s*(\d+)\)/i);
    if (qtyMatch) {
      itemQuantity = parseInt(qtyMatch[1]);
      // Remove the quantity part from the name
      fullName = fullName.replace(/\s*\(Qty:\s*\d+\)\s*/, '');
    }
    
    // For complex item names, extract the main product name and move details to notes
    // Pattern: Main product name, then details separated by " - "
    let itemName = fullName;
    let extractedNotes = '';
    
    // Split by " - " to separate main item from details
    const parts = fullName.split(' - ');
    if (parts.length > 1) {
      // Take the first part as the main item name
      itemName = parts[0].trim();
      // Join the rest as notes
      extractedNotes = parts.slice(1).join(' - ').trim();
    }
    
    // Combine existing notes with extracted notes
    let finalNotes = '';
    if (itemNotes && extractedNotes) {
      finalNotes = `${itemNotes}; ${extractedNotes}`;
    } else if (itemNotes) {
      finalNotes = itemNotes;
    } else if (extractedNotes) {
      finalNotes = extractedNotes;
    }
    
    
    return {
      name: itemName,
      quantity: itemQuantity,
      notes: finalNotes,
      unit: item.unit || 'pcs'
    };
  };

  // Initialize editable items when entering edit mode
  useEffect(() => {
    if (isEditing) {
      const itemsToEdit = fetchedItems.length > 0 ? fetchedItems : (order.items || []);
      setEditableItems(itemsToEdit.map((item, idx) => ({
        id: item.id || `item-${idx}`,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        notes: item.notes
      })));
    }
  }, [isEditing, fetchedItems, order.items]);

  const addItem = () => {
    const newItem: OrderItem = {
      id: `item-${Date.now()}`,
      name: '',
      quantity: 1,
      unit: 'pcs',
      notes: ''
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
    // Validate items
    const validItems = editableItems.filter(item => item.name.trim() !== '');
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
      // Convert items to description format for storage
      const description = validItems.map(item => 
        `${item.name.trim()} (Qty: ${item.quantity})`
      ).join('\n');

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
        description: "Order items updated successfully.",
      });
      
      setIsEditing(false);
      if (onSave) onSave();
    } catch (error: any) {
      console.error("Error updating order:", error);
      toast({
        title: "Error",
        description: "Failed to update order items: " + error.message,
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

  // Use fetched items from database, fallback to order.items
  const displayItems = isEditing ? editableItems : (fetchedItems.length > 0 ? fetchedItems : (order.items || []));


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
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
              <p className="text-sm text-gray-500">Company</p>
              <p className="font-medium">{order.companyName || 'No Company'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Order Date</p>
              <p>{new Date(order.created_at).toLocaleDateString()}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Status</p>
              <Badge className={getStatusColor(order.status)}>
                {order.status || 'pending'}
              </Badge>
            </div>
            <div>
              <p className="text-sm text-gray-500">Urgency</p>
              <Badge className={getUrgencyColor(order.urgency)}>
                {order.urgency || 'normal'}
              </Badge>
            </div>
          </div>

          {order.notes && (
            <div>
              <p className="text-sm text-gray-500 mb-2">Order Notes</p>
              <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-md">
                <p className="text-sm whitespace-pre-wrap">{order.notes}</p>
              </div>
            </div>
          )}
          
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium text-lg">Order Items</h3>
              {isEditing && (
                <Button type="button" variant="outline" size="sm" onClick={addItem}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Item
                </Button>
              )}
            </div>
            
            {displayItems.length === 0 ? (
              <div className="text-center p-8 border rounded-md border-dashed">
                <p className="text-gray-500">
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
                      className="w-24"
                    />
                    <Input
                      placeholder="Unit"
                      value={item.unit || 'pcs'}
                      onChange={(e) => updateItemField(item.id, 'unit', e.target.value)}
                      className="w-24"
                    />
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
              <div className="border rounded-lg divide-y">
                <div className="grid grid-cols-12 gap-4 p-4 bg-gray-50 font-medium text-sm text-gray-700">
                  <div className="col-span-4">Item Name</div>
                  <div className="col-span-2 text-center">Quantity</div>
                  <div className="col-span-1 text-center">Unit</div>
                  <div className="col-span-5">Notes</div>
                </div>
                {displayItems.map((item, index) => {
                  const parsedItem = parseItemData(item);
                  
                  return (
                    <div key={`item-${index}`} className="grid grid-cols-12 gap-4 p-4 items-start hover:bg-gray-50">
                      <div className="col-span-4">
                        <p className="font-medium text-gray-900 break-words">
                          {parsedItem.name}
                        </p>
                      </div>
                      <div className="col-span-2 text-center">
                        <span className="text-gray-600 font-semibold">
                          {parsedItem.quantity}
                        </span>
                      </div>
                      <div className="col-span-1 text-center">
                        <span className="text-gray-600">
                          {parsedItem.unit}
                        </span>
                      </div>
                      <div className="col-span-5">
                        <p className="text-sm text-gray-600 break-words">
                          {parsedItem.notes || '-'}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
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
