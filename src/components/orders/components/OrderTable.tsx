
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import OrderRow from "./OrderRow";
import { OrderWithCompany } from "../types/orderTypes";
import { useIsMobile } from "@/hooks/use-mobile";

interface OrderTableProps {
  orders: OrderWithCompany[];
  isAdmin: boolean;
  onReceiveOrder: (order: OrderWithCompany) => void;
  onDeleteOrder: (orderId: string, orderNumber: string) => void;
  onOrderClick?: (order: OrderWithCompany) => void;
  compact?: boolean;
}

export default function OrderTable({ 
  orders, 
  isAdmin, 
  onReceiveOrder, 
  onDeleteOrder,
  onOrderClick,
  compact = false
}: OrderTableProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    // Mobile card layout
    return (
      <div className={compact ? 'space-y-1' : 'space-y-2'}>
        {orders.length === 0 ? (
          <div className="text-center py-6 bg-card rounded-lg">
            <p className="text-muted-foreground text-sm">No orders found.</p>
          </div>
        ) : (
          orders.map((order) => (
            <div key={order.id} className={`glass-card glow-border rounded-lg shadow-sm ${compact ? 'p-2' : 'p-3'}`}>
              <OrderRow
                order={order}
                isAdmin={isAdmin}
                onReceiveOrder={onReceiveOrder}
                onDeleteOrder={onDeleteOrder}
                onOrderClick={onOrderClick}
                compact={compact}
              />
            </div>
          ))
        )}
      </div>
    );
  }

  // Desktop table layout
  return (
    <div className="glass-card glow-border rounded-lg shadow overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="whitespace-nowrap">Order Number</TableHead>
              <TableHead className="whitespace-nowrap">Company</TableHead>
              <TableHead className="whitespace-nowrap">Status</TableHead>
              <TableHead className="whitespace-nowrap">Created</TableHead>
              {!compact && <TableHead className="whitespace-nowrap">Notes</TableHead>}
              {!compact && <TableHead className="whitespace-nowrap">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={compact ? 4 : 6} className="text-center py-8">
                  No orders found.
                </TableCell>
              </TableRow>
            ) : (
              orders.map((order) => (
                <OrderRow
                  key={order.id}
                  order={order}
                  isAdmin={isAdmin}
                  onReceiveOrder={onReceiveOrder}
                  onDeleteOrder={onDeleteOrder}
                  onOrderClick={onOrderClick}
                  compact={compact}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
