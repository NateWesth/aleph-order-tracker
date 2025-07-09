
import { TableCell, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, Eye, MoreHorizontal } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import OrderExportActions from "./OrderExportActions";
import { useState } from "react";
import OrderDetailsDialog from "./OrderDetailsDialog";
import { OrderWithCompany } from "../types/orderTypes";

interface OrderRowProps {
  order: OrderWithCompany;
  isAdmin: boolean;
  onReceiveOrder: (order: OrderWithCompany) => void;
  onDeleteOrder: (orderId: string, orderNumber: string) => void;
}

export default function OrderRow({ 
  order, 
  isAdmin,
  onReceiveOrder,
  onDeleteOrder
}: OrderRowProps) {
  const [showDetails, setShowDetails] = useState(false);

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

  const getStatusBadge = (status: string | null) => (
    <Badge className={getStatusColor(status)}>
      {status || 'pending'}
    </Badge>
  );

  // Parse items from description to include notes
  const parseOrderItems = (description: string | null) => {
    if (!description) return [];
    
    return description.split('\n').map((line, index) => {
      // Check for format: "Item Name (Qty: X) - Notes"
      const matchWithNotes = line.match(/^(.+?)\s*\(Qty:\s*(\d+)\)\s*-\s*(.+)$/);
      if (matchWithNotes) {
        return {
          id: `item-${index}`,
          name: matchWithNotes[1].trim(),
          quantity: parseInt(matchWithNotes[2]),
          notes: matchWithNotes[3].trim()
        };
      }
      
      // Check for format: "Item Name (Qty: X)"
      const match = line.match(/^(.+?)\s*\(Qty:\s*(\d+)\)$/);
      if (match) {
        return {
          id: `item-${index}`,
          name: match[1].trim(),
          quantity: parseInt(match[2])
        };
      }
      
      return {
        id: `item-${index}`,
        name: line.trim(),
        quantity: 1
      };
    }).filter(item => item.name);
  };

  const orderItems = parseOrderItems(order.description);

  return (
    <>
      <TableRow className="hover:bg-gray-50">
        <TableCell>{order.order_number}</TableCell>
        <TableCell>{order.companyName || 'No Company'}</TableCell>
        <TableCell>{getStatusBadge(order.status)}</TableCell>
        <TableCell>{new Date(order.created_at).toLocaleDateString()}</TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDetails(true)}
            >
              <Eye className="h-4 w-4" />
            </Button>
            <OrderExportActions order={order} />
            {isAdmin && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="h-8 w-8 p-0">
                    <span className="sr-only">Open menu</span>
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => onReceiveOrder(order)}
                  >
                    Receive Order
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => onDeleteOrder(order.id, order.order_number)}
                  >
                    Delete Order
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </TableCell>
      </TableRow>

      <OrderDetailsDialog
        open={showDetails}
        onOpenChange={setShowDetails}
        orderNumber={order.order_number}
        companyName={order.companyName || 'No Company'}
        status={order.status}
        createdAt={order.created_at}
        items={orderItems}
        urgency={order.urgency}
      />
    </>
  );
}
