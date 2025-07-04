
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import OrderRow from "./OrderRow";

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

interface OrderTableProps {
  orders: OrderWithCompany[];
  isAdmin: boolean;
  onReceiveOrder: (order: OrderWithCompany) => void;
  onDeleteOrder: (orderId: string, orderNumber: string) => void;
}

export default function OrderTable({ orders, isAdmin, onReceiveOrder, onDeleteOrder }: OrderTableProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Order Number</TableHead>
            <TableHead>Company</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center py-8">
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
