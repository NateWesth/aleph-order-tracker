
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

interface OrderTableProps {
  orders: OrderWithCompany[];
  isAdmin: boolean;
  onReceiveOrder: (order: OrderWithCompany) => void;
  onDeleteOrder: (orderId: string, orderNumber: string) => void;
}

export default function OrderTable({ orders, isAdmin, onReceiveOrder, onDeleteOrder }: OrderTableProps) {
  return (
    <div className="bg-card border border-border rounded-lg shadow">
      <Table>
        <TableHeader>
          <TableRow className="border-b border-border">
            <TableHead className="text-card-foreground">Order Number</TableHead>
            <TableHead className="text-card-foreground">Company</TableHead>
            <TableHead className="text-card-foreground">Status</TableHead>
            <TableHead className="text-card-foreground">Created</TableHead>
            <TableHead className="text-card-foreground">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.length === 0 ? (
            <TableRow className="border-b border-border">
              <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
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
              />
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
