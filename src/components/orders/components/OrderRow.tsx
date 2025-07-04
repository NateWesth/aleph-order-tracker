import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Trash2, CheckCircle, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import OrderDetailsDialog from "./OrderDetailsDialog";
import OrderExportActions from "./OrderExportActions";

interface OrderWithCompany {
  id: string;
  order_number: string;
  description: string | null;
  status: string | null;
  total_amount: number | null;
  created_at: string;
  updated_at: string;
  company_id: string | null;
  companyName: string;
}

interface OrderRowProps {
  order: OrderWithCompany;
  isAdmin: boolean;
  onReceiveOrder: (order: OrderWithCompany) => void;
  onDeleteOrder: (orderId: string, orderNumber: string) => void;
}

export default function OrderRow({ order, isAdmin, onReceiveOrder, onDeleteOrder }: OrderRowProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [companyName, setCompanyName] = useState<string>(order.companyName || 'Unknown Company');
  const [orderItems, setOrderItems] = useState<Array<{id: string, name: string, quantity: number}>>([]);

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

  const fetchCompanyName = async () => {
    if (order.company_id && !order.companyName) {
      const { data } = await supabase
        .from('companies')
        .select('name')
        .eq('id', order.company_id)
        .single();
      
      if (data) {
        setCompanyName(data.name);
      }
    }
  };

  const parseOrderItems = () => {
    if (!order.description) {
      setOrderItems([]);
      return;
    }

    // Parse the description to extract items and quantities
    // Format: "Item Name (Qty: 2)\nAnother Item (Qty: 1)"
    const items = order.description.split('\n').map((line, index) => {
      const match = line.match(/^(.+?)\s*\(Qty:\s*(\d+)\)$/);
      if (match) {
        return {
          id: `item-${index}`,
          name: match[1].trim(),
          quantity: parseInt(match[2])
        };
      }
      // Fallback for items without quantity format
      return {
        id: `item-${index}`,
        name: line.trim(),
        quantity: 1
      };
    }).filter(item => item.name);

    setOrderItems(items);
  };

  const handleViewDetails = async () => {
    await fetchCompanyName();
    parseOrderItems();
    setShowDetails(true);
  };

  return (
    <>
      <TableRow>
        <TableCell className="font-medium">
          {order.order_number}
        </TableCell>
        <TableCell>
          {order.companyName || 'No Company'}
        </TableCell>
        <TableCell>
          <Badge className={getStatusColor(order.status)}>
            {order.status || 'pending'}
          </Badge>
        </TableCell>
        <TableCell>
          {new Date(order.created_at).toLocaleDateString()}
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            <OrderExportActions 
              order={{
                id: order.id,
                order_number: order.order_number,
                description: order.description,
                status: order.status,
                total_amount: order.total_amount,
                created_at: order.created_at,
                company_id: order.company_id,
                companyName: order.companyName,
                items: orderItems
              }}
            />
            
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleViewDetails}
            >
              <Eye className="h-4 w-4 mr-1" />
              View Details
            </Button>
            {isAdmin && order.status === 'pending' && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => onReceiveOrder(order)}
                className="text-green-600 hover:text-green-700"
              >
                <CheckCircle className="h-4 w-4 mr-1" />
                Receive
              </Button>
            )}
            {isAdmin && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Order</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete order {order.order_number}? This action cannot be undone and will remove the order from all systems.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction 
                      onClick={() => onDeleteOrder(order.id, order.order_number)}
                      className="bg-red-600 hover:bg-red-700"
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </TableCell>
      </TableRow>

      <OrderDetailsDialog
        open={showDetails}
        onOpenChange={setShowDetails}
        orderNumber={order.order_number}
        companyName={companyName}
        status={order.status}
        createdAt={order.created_at}
        items={orderItems}
      />
    </>
  );
}
