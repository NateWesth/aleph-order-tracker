
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
}

export default function OrderTable({ 
  orders, 
  isAdmin, 
  onReceiveOrder, 
  onDeleteOrder,
  onOrderClick 
}: OrderTableProps) {
  const isMobile = useIsMobile();

  return (
    <div className="bg-card rounded-lg shadow overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="whitespace-nowrap">Order Number</TableHead>
              {!isMobile && <TableHead className="whitespace-nowrap">Company</TableHead>}
              <TableHead className="whitespace-nowrap">Status</TableHead>
              {!isMobile && <TableHead className="whitespace-nowrap">Created</TableHead>}
              <TableHead className="whitespace-nowrap">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={isMobile ? 3 : 5} className="text-center py-8">
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
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
