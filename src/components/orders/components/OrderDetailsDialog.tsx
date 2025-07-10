
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

  // COMPLETELY REWRITTEN parsing function to properly separate item names and notes
  const parseOrderItems = (description: string | null): OrderItem[] => {
    if (!description) return [];
    
    console.log('🔍 OrderDetailsDialog: Raw description to parse:', description);
    
    const items: OrderItem[] = [];
    const lines = description.split('\n').filter(line => line.trim());
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      console.log(`🔍 Processing line: "${trimmedLine}"`);
      
      // Check if line has notes pattern: "Something (Qty: X) - Notes"
      if (trimmedLine.includes(' - ') && trimmedLine.includes('(Qty:')) {
        const dashIndex = trimmedLine.lastIndexOf(' - ');
        const beforeDash = trimmedLine.substring(0, dashIndex);
        const afterDash = trimmedLine.substring(dashIndex + 3);
        
        // Extract quantity from before dash
        const qtyMatch = beforeDash.match(/\(Qty:\s*(\d+)\)/);
        if (qtyMatch) {
          const itemName = beforeDash.replace(/\s*\(Qty:\s*\d+\)/, '').trim();
          const quantity = parseInt(qtyMatch[1]);
          const notes = afterDash.trim();
          
          items.push({
            name: itemName,  // ONLY item name here
            quantity: quantity,
            notes: notes     // ONLY notes here
          });
          console.log('✅ Parsed item with notes:', { name: itemName, quantity, notes });
          continue;
        }
      }
      
      // Check if line has quantity but no notes: "Something (Qty: X)"
      const qtyOnlyMatch = trimmedLine.match(/^(.+?)\s*\(Qty:\s*(\d+)\)$/);
      if (qtyOnlyMatch) {
        const itemName = qtyOnlyMatch[1].trim();
        const quantity = parseInt(qtyOnlyMatch[2]);
        
        items.push({
          name: itemName,  // ONLY item name here
          quantity: quantity
          // NO notes property at all
        });
        console.log('✅ Parsed item without notes:', { name: itemName, quantity });
        continue;
      }
      
      // Fallback: treat as simple item
      items.push({
        name: trimmedLine,
        quantity: 1
      });
      console.log('✅ Simple item:', { name: trimmedLine, quantity: 1 });
    }

    console.log('🎯 Final parsed items array:', items);
    return items;
  };

  // Get display items with proper structure
  const displayItems: OrderItem[] = order.items && order.items.length > 0 ? 
    order.items.map(item => {
      console.log('🔍 Processing structured item:', item);
      return {
        name: item.name,      // ONLY item name
        quantity: item.quantity,
        notes: item.notes     // ONLY notes
      };
    }) : 
    parseOrderItems(order.description);

  console.log('📋 Final display items for rendering:', displayItems);

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
                {displayItems.map((item, index) => {
                  console.log(`🔍 Rendering item ${index}:`, item);
                  return (
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
                  );
                })}
              </div>
            )}
          </div>
          
          {/* Debug section - remove in production */}
          <div className="mt-4 p-4 bg-gray-100 rounded text-xs">
            <p><strong>Debug - Raw Description:</strong></p>
            <pre className="whitespace-pre-wrap">{order.description || 'No description'}</pre>
            <p className="mt-2"><strong>Debug - Parsed Items:</strong></p>
            <pre className="whitespace-pre-wrap">{JSON.stringify(displayItems, null, 2)}</pre>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
