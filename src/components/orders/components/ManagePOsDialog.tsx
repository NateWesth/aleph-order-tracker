import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Truck } from "lucide-react";
import PurchaseOrdersPanel from "./PurchaseOrdersPanel";

interface ManagePOsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  orderNumber: string;
  onSave?: () => void;
}

export default function ManagePOsDialog({
  open,
  onOpenChange,
  orderId,
  orderNumber,
  onSave,
}: ManagePOsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            Manage Purchase Orders - {orderNumber}
          </DialogTitle>
        </DialogHeader>
        <PurchaseOrdersPanel
          orderId={orderId}
          orderNumber={orderNumber}
          onSaved={() => {
            onSave?.();
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
