
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

interface OrderItem {
  name: string;
  quantity: number;
}

interface OrderDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderNumber: string;
  companyName: string;
  status: string | null;
  createdAt: string;
  items: OrderItem[];
}

export default function OrderDetailsDialog({
  open,
  onOpenChange,
  orderNumber,
  companyName,
  status,
  createdAt,
  items
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Order Details - {orderNumber}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-500">Company</p>
              <p className="font-medium">{companyName}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Order Date</p>
              <p>{new Date(createdAt).toLocaleDateString()}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Status</p>
              <Badge className={getStatusColor(status)}>
                {status || 'pending'}
              </Badge>
            </div>
          </div>
          
          <div>
            <h3 className="font-medium mb-3">Order Items</h3>
            {items.length === 0 ? (
              <div className="text-center p-6 border rounded-md border-dashed">
                <p className="text-gray-500">No items found in this order.</p>
              </div>
            ) : (
              <div className="border rounded-md divide-y">
                {items.map((item, index) => (
                  <div key={index} className="p-3 flex justify-between items-center">
                    <div>
                      <p className="font-medium">{item.name}</p>
                    </div>
                    <div className="text-sm text-gray-600">
                      Qty: {item.quantity}
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
