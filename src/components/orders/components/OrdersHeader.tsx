
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Plus } from "lucide-react";

interface OrdersHeaderProps {
  isAdmin?: boolean;
  onCreateOrder?: () => void;
}

export default function OrdersHeader({
  isAdmin = false,
  onCreateOrder
}: OrdersHeaderProps) {
  return (
    <div className="flex justify-between items-center mb-6">
      <h1 className="text-2xl font-bold text-aleph-green">Orders Management</h1>
      <div className="flex items-center gap-2">
        {onCreateOrder && (
          <Button onClick={onCreateOrder} className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Create Order
          </Button>
        )}
      </div>
    </div>
  );
}
