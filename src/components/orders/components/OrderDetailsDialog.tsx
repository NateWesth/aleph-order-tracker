
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
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    }
  };

  // Fixed parsing function - ensures notes NEVER appear in item names
  const parseOrderItems = (description: string | null): OrderItem[] => {
    if (!description) return [];
    
    console.log('🔍 OrderDetailsDialog: Parsing description:', description);
    
    const items: OrderItem[] = [];
    const lines = description.split('\n').filter(line => line.trim());
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      console.log(`🔍 OrderDetailsDialog: Processing line: "${trimmedLine}"`);
      
      // First check for pattern with notes: "ItemName (Qty: X) - Notes"
      const withNotesPattern = /^(.+?)\s*\(Qty:\s*(\d+)\)\s*-\s*(.+)$/;
      const withNotesMatch = trimmedLine.match(withNotesPattern);
      
      if (withNotesMatch) {
        // Extract clean item name (everything before " (Qty:")
        const itemName = withNotesMatch[1].trim();
        const quantity = parseInt(withNotesMatch[2]);
        const notes = withNotesMatch[3].trim();
        
        items.push({
          name: itemName,  // Only the item name, no notes here
          quantity: quantity,
          notes: notes     // Notes go here only
        });
        console.log('✅ Item with notes:', { name: itemName, quantity, notes });
        continue;
      }
      
      // Check for pattern without notes: "ItemName (Qty: X)"
      const withoutNotesPattern = /^(.+?)\s*\(Qty:\s*(\d+)\)$/;
      const withoutNotesMatch = trimmedLine.match(withoutNotesPattern);
      
      if (withoutNotesMatch) {
        const itemName = withoutNotesMatch[1].trim();
        const quantity = parseInt(withoutNotesMatch[2]);
        
        items.push({
          name: itemName,  // Only the item name
          quantity: quantity
          // No notes property = no notes displayed
        });
        console.log('✅ Item without notes:', { name: itemName, quantity });
        continue;
      }
      
      // Fallback: treat entire line as item name
      items.push({
        name: trimmedLine,
        quantity: 1
      });
      console.log('✅ Simple item:', { name: trimmedLine, quantity: 1 });
    }

    console.log('🎯 OrderDetailsDialog: Final items with proper separation:', items);
    return items;
  };

  // Get display items - ensure proper structure
  const displayItems: OrderItem[] = order.items && order.items.length > 0 ? 
    order.items.map(item => ({
      name: item.name,      // Item name only
      quantity: item.quantity,
      notes: item.notes     // Notes only in notes field
    })) : 
    parseOrderItems(order.description);

  console.log('📋 OrderDetailsDialog: Final display items:', displayItems);

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
                      {item.notes ? (
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
          
          {/* Debug section - remove in production */}
          <div className="mt-4 p-4 bg-gray-100 rounded text-xs">
            <p><strong>Debug - Raw Description:</strong></p>
            <pre className="whitespace-pre-wrap">{order.description || 'No description'}</pre>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
