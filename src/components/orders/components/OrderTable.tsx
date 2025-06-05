
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import OrderRow from "./OrderRow";

interface Order {
  id: string;
  order_number: string;
  description: string | null;
  status: string | null;
  total_amount: number | null;
  created_at: string;
  company_id: string | null;
}

interface OrderTableProps {
  orders: Order[];
  isAdmin: boolean;
  onReceiveOrder: (order: Order) => void;
  onDeleteOrder: (orderId: string, orderNumber: string) => void;
}

export default function OrderTable({ orders, isAdmin, onReceiveOrder, onDeleteOrder }: OrderTableProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Order Number</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Created</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center py-8">
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
