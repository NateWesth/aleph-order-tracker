import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Truck, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Supplier {
  id: string;
  name: string;
  code: string;
}

interface PurchaseOrder {
  id?: string;
  supplier_id: string;
  purchase_order_number: string;
  supplierName?: string;
}

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
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);

  // Fetch suppliers and existing POs when dialog opens
  useEffect(() => {
    const fetchData = async () => {
      if (!open || !orderId) return;
      
      setFetching(true);
      try {
        // Fetch suppliers
        const { data: suppliersData } = await supabase
          .from("suppliers")
          .select("id, name, code")
          .order("name");
        if (suppliersData) setSuppliers(suppliersData);

        // Fetch existing purchase orders
        const { data: posData } = await supabase
          .from("order_purchase_orders")
          .select("id, supplier_id, purchase_order_number")
          .eq("order_id", orderId);

        if (posData && posData.length > 0) {
          const posWithNames = posData.map(po => ({
            ...po,
            supplierName: suppliersData?.find(s => s.id === po.supplier_id)?.name || 'Unknown'
          }));
          setPurchaseOrders(posWithNames);
        } else {
          setPurchaseOrders([]);
        }
      } catch (error) {
        console.error("Error fetching data:", error);
        toast({
          title: "Error",
          description: "Failed to load purchase orders",
          variant: "destructive",
        });
      } finally {
        setFetching(false);
      }
    };
    fetchData();
  }, [open, orderId, toast]);

  const addPurchaseOrder = () => {
    setPurchaseOrders(prev => [...prev, {
      supplier_id: '',
      purchase_order_number: '',
    }]);
  };

  const removePurchaseOrder = (index: number) => {
    setPurchaseOrders(prev => prev.filter((_, i) => i !== index));
  };

  const updatePurchaseOrder = (index: number, field: keyof PurchaseOrder, value: string) => {
    setPurchaseOrders(prev => prev.map((po, i) => 
      i === index ? { ...po, [field]: value } : po
    ));
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      // Filter valid POs
      const validPOs = purchaseOrders.filter(po => 
        po.supplier_id && po.purchase_order_number.trim()
      );

      // Delete existing POs
      await supabase
        .from('order_purchase_orders')
        .delete()
        .eq('order_id', orderId);

      // Insert new POs
      if (validPOs.length > 0) {
        const { error: poError } = await supabase
          .from('order_purchase_orders')
          .insert(validPOs.map(po => ({
            order_id: orderId,
            supplier_id: po.supplier_id,
            purchase_order_number: po.purchase_order_number.trim(),
          })));
        
        if (poError) throw poError;
      }

      toast({
        title: "Success",
        description: `Purchase orders updated for ${orderNumber}`,
      });
      
      onOpenChange(false);
      if (onSave) onSave();
    } catch (error: any) {
      console.error("Error saving POs:", error);
      toast({
        title: "Error",
        description: "Failed to save purchase orders: " + error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            Manage Purchase Orders - {orderNumber}
          </DialogTitle>
        </DialogHeader>

        {fetching ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Link supplier purchase orders to this client order
              </p>
              <Button type="button" variant="outline" size="sm" onClick={addPurchaseOrder}>
                <Plus className="h-4 w-4 mr-2" />
                Add PO
              </Button>
            </div>

            {purchaseOrders.length === 0 ? (
              <div className="text-center py-8 border rounded-lg border-dashed bg-muted/30">
                <Truck className="h-10 w-10 mx-auto text-muted-foreground/50 mb-2" />
                <p className="text-sm text-muted-foreground">
                  No purchase orders linked yet.
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Click "Add PO" to link a supplier purchase order.
                </p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                {purchaseOrders.map((po, index) => (
                  <div key={index} className="flex items-start gap-3 p-3 border rounded-lg bg-muted/30">
                    <span className="text-sm font-medium text-muted-foreground pt-7">
                      {index + 1}.
                    </span>
                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Supplier</Label>
                        <Select 
                          value={po.supplier_id || "none"} 
                          onValueChange={(val) => updatePurchaseOrder(index, 'supplier_id', val === "none" ? "" : val)}
                        >
                          <SelectTrigger className="bg-background">
                            <SelectValue placeholder="Select supplier" />
                          </SelectTrigger>
                          <SelectContent className="z-50 bg-background border">
                            <SelectItem value="none">Select a supplier</SelectItem>
                            {suppliers.map((supplier) => (
                              <SelectItem key={supplier.id} value={supplier.id}>
                                {supplier.name} ({supplier.code})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">PO Number</Label>
                        <Input
                          value={po.purchase_order_number}
                          onChange={(e) => updatePurchaseOrder(index, 'purchase_order_number', e.target.value)}
                          placeholder="e.g., PO-2024-001"
                          className="bg-background"
                        />
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removePurchaseOrder(index)}
                      className="text-destructive hover:text-destructive shrink-0 mt-5"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={loading || fetching}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
