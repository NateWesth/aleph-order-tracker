
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2, Plus } from "lucide-react";

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
}

interface OrderItemsFormProps {
  items: OrderItem[];
  onItemsChange: (items: OrderItem[]) => void;
}

export default function OrderItemsForm({ items, onItemsChange }: OrderItemsFormProps) {
  const addItem = () => {
    const newItem: OrderItem = {
      id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: '',
      quantity: 1
    };
    onItemsChange([...items, newItem]);
  };

  const removeItem = (itemId: string) => {
    onItemsChange(items.filter(item => item.id !== itemId));
  };

  const updateItem = (itemId: string, field: keyof OrderItem, value: string | number) => {
    onItemsChange(items.map(item => 
      item.id === itemId ? { ...item, [field]: value } : item
    ));
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <Label>Order Items *</Label>
        <Button type="button" variant="outline" size="sm" onClick={addItem}>
          <Plus className="h-4 w-4 mr-1" />
          Add Item
        </Button>
      </div>
      
      {items.length === 0 && (
        <div className="text-center p-4 border border-dashed rounded-md">
          <p className="text-gray-500">No items added yet. Click "Add Item" to get started.</p>
        </div>
      )}
      
      {items.map((item, index) => (
        <div key={item.id} className="border rounded-md p-4 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">Item {index + 1}</span>
            {items.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeItem(item.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
          
          <div>
            <Label htmlFor={`item-name-${item.id}`}>Description</Label>
            <Input
              id={`item-name-${item.id}`}
              value={item.name}
              onChange={(e) => updateItem(item.id, 'name', e.target.value)}
              placeholder="Enter item description"
              required
            />
          </div>
          
          <div>
            <Label htmlFor={`item-quantity-${item.id}`}>Quantity</Label>
            <Input
              id={`item-quantity-${item.id}`}
              type="number"
              min="1"
              value={item.quantity}
              onChange={(e) => updateItem(item.id, 'quantity', parseInt(e.target.value) || 1)}
              placeholder="Enter quantity"
              required
            />
          </div>
        </div>
      ))}
    </div>
  );
}
