
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { OrderWithCompany } from "../types/orderTypes";

interface OrderItem {
  name: string;
  quantity: number;
  unit?: string;
  notes?: string;
}

interface OrderDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: OrderWithCompany;
}

export default function OrderDetailsDialog({
  open,
  onOpenChange,
  order
}: OrderDetailsDialogProps) {
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
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dot-gray-300';
    }
  };

  // FIXED parsing function to properly separate item names and notes
  const parseOrderItems = (description: string | null): OrderItem[] => {
    if (!description) return [];
    
    const items: OrderItem[] = [];
    const lines = description.split('\n').filter(line => line.trim());
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Pattern: "Item Name (Qty: X) - Notes"
      const matchWithNotes = trimmedLine.match(/^(.+?)\s*\(Qty:\s*(\d+)\)\s*-\s*(.+)$/);
      if (matchWithNotes) {
        const [, itemName, quantity, notes] = matchWithNotes;
        items.push({
          name: itemName.trim(),
          quantity: parseInt(quantity),
          notes: notes.trim()
        });
        continue;
      }
      
      // Pattern: "Item Name (Qty: X)" without notes
      const matchWithoutNotes = trimmedLine.match(/^(.+?)\s*\(Qty:\s*(\d+)\)\s*$/);
      if (matchWithoutNotes) {
        const [, itemName, quantity] = matchWithoutNotes;
        items.push({
          name: itemName.trim(),
          quantity: parseInt(quantity)
        });
        continue;
      }
      
      // Fallback: treat as simple item name
      items.push({
        name: trimmedLine,
        quantity: 1
      });
    }

    return items;
  };

  // Get display items with proper structure
  const displayItems: OrderItem[] = order.items && order.items.length > 0 ? 
    order.items.map(item => ({
      name: item.name,
      quantity: item.quantity,
      notes: item.notes
    })) : 
    parseOrderItems(order.description);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Order Details - {order.order_number}</DialogTitle>
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
          
          <div>
            <h3 className="font-medium mb-4 text-lg">Order Items</h3>
            {displayItems.length === 0 ? (
              <div className="text-center p-8 border rounded-md border-dashed">
                <p className="text-gray-500">No items found in this order.</p>
              </div>
            ) : (
              <div className="border rounded-lg divide-y">
                <div className="grid grid-cols-12 gap-4 p-4 bg-gray-50 font-medium text-sm text-gray-700">
                  <div className="col-span-5">Item Name</div>
                  <div className="col-span-2 text-center">Quantity</div>
                  <div className="col-span-2 text-center">Unit</div>
                  <div className="col-span-3">Notes</div>
                </div>
                {displayItems.map((item, index) => (
                  <div key={index} className="grid grid-cols-12 gap-4 p-4 items-start hover:bg-gray-50">
                    <div className="col-span-5">
                      <p className="font-medium text-gray-900">{item.name}</p>
                    </div>
                    <div className="col-span-2 text-center">
                      <span className="text-gray-600">{item.quantity}</span>
                    </div>
                    <div className="col-span-2 text-center">
                      <span className="text-gray-600">{item.unit || 'pcs'}</span>
                    </div>
                    <div className="col-span-3">
                      {item.notes && item.notes.trim() ? (
                        <p className="text-sm text-gray-600">{item.notes}</p>
                      ) : (
                        <span className="text-gray-400 text-sm italic">No notes</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
