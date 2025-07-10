
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { OrderWithCompany } from "../types/orderTypes";

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
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 text-gray-300';
    }
  };

  // Parse item data to extract name, quantity, and notes
  const parseItemData = (item: any) => {
    let fullName = item.name || '';
    let itemQuantity = item.quantity || 0;
    let itemNotes = item.notes || '';
    
    console.log('Parsing item:', { fullName, itemQuantity, itemNotes });
    
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
    
    console.log('Parsed result:', { 
      name: itemName, 
      quantity: itemQuantity, 
      notes: finalNotes,
      unit: item.unit || 'pcs'
    });
    
    return {
      name: itemName,
      quantity: itemQuantity,
      notes: finalNotes,
      unit: item.unit || 'pcs'
    };
  };

  // Use structured items directly
  const displayItems = order.items || [];

  console.log('Items count:', displayItems.length);
  console.log('Raw items:', JSON.stringify(displayItems, null, 2));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
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
      </DialogContent>
    </Dialog>
  );
}
