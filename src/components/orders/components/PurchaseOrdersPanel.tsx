import { useState, useEffect } from "react";
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
import { Plus, Trash2, Truck, Loader2, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Supplier { id: string; name: string; code: string; }
interface PurchaseOrder {
  id?: string;
  supplier_id: string;
  purchase_order_number: string;
  notes?: string;
}

interface PurchaseOrdersPanelProps {
  orderId: string;
  orderNumber?: string;
  onSaved?: () => void;
  /** Hide the internal Save button (parent will trigger save via ref) */
  hideSaveButton?: boolean;
}

export default function PurchaseOrdersPanel({
  orderId,
  orderNumber,
  onSaved,
  hideSaveButton,
}: PurchaseOrdersPanelProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [pos, setPos] = useState<PurchaseOrder[]>([]);

  useEffect(() => {
    if (!orderId) return;
    const load = async () => {
      setFetching(true);
      try {
        const [{ data: sup }, { data: existing }] = await Promise.all([
          supabase.from("suppliers").select("id, name, code").order("name"),
          supabase.from("order_purchase_orders")
            .select("id, supplier_id, purchase_order_number, notes")
            .eq("order_id", orderId),
        ]);
        if (sup) setSuppliers(sup);
        setPos(existing || []);
      } catch (e: any) {
        toast({ title: "Error", description: "Failed to load purchase orders", variant: "destructive" });
      } finally {
        setFetching(false);
      }
    };
    void load();
  }, [orderId, toast]);

  const addPO = () => setPos(p => [...p, { supplier_id: "", purchase_order_number: "" }]);
  const removePO = (i: number) => setPos(p => p.filter((_, idx) => idx !== i));
  const updatePO = (i: number, field: keyof PurchaseOrder, value: string) =>
    setPos(p => p.map((po, idx) => idx === i ? { ...po, [field]: value } : po));

  const handleSave = async () => {
    setLoading(true);
    try {
      const valid = pos.filter(po => po.supplier_id && po.purchase_order_number.trim());
      await supabase.from("order_purchase_orders").delete().eq("order_id", orderId);
      if (valid.length > 0) {
        const { error } = await supabase.from("order_purchase_orders").insert(
          valid.map(po => ({
            order_id: orderId,
            supplier_id: po.supplier_id,
            purchase_order_number: po.purchase_order_number.trim(),
            notes: po.notes || null,
          }))
        );
        if (error) throw error;
      }
      toast({ title: "Saved", description: `Purchase orders updated${orderNumber ? ` for ${orderNumber}` : ""}.` });
      onSaved?.();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Link supplier purchase orders to this client order
        </p>
        <Button type="button" variant="outline" size="sm" onClick={addPO}>
          <Plus className="h-4 w-4 mr-2" />
          Add PO
        </Button>
      </div>

      {pos.length === 0 ? (
        <div className="text-center py-8 border rounded-lg border-dashed bg-muted/30">
          <Truck className="h-10 w-10 mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">No purchase orders linked yet.</p>
          <p className="text-xs text-muted-foreground mt-1">Click "Add PO" to link a supplier purchase order.</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
          {pos.map((po, index) => (
            <div key={index} className="flex items-start gap-3 p-3 border rounded-lg bg-muted/30">
              <span className="text-sm font-medium text-muted-foreground pt-7">{index + 1}.</span>
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Supplier</Label>
                  <Select
                    value={po.supplier_id || "none"}
                    onValueChange={(val) => updatePO(index, "supplier_id", val === "none" ? "" : val)}
                  >
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder="Select supplier" />
                    </SelectTrigger>
                    <SelectContent className="z-50 bg-background border">
                      <SelectItem value="none">Select a supplier</SelectItem>
                      {suppliers.map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.name} ({s.code})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">PO Number</Label>
                  <Input
                    value={po.purchase_order_number}
                    onChange={(e) => updatePO(index, "purchase_order_number", e.target.value)}
                    placeholder="e.g., PO-2024-001"
                    className="bg-background"
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs">Notes (optional)</Label>
                  <Input
                    value={po.notes || ""}
                    onChange={(e) => updatePO(index, "notes", e.target.value)}
                    placeholder="ETA, partial delivery, etc."
                    className="bg-background"
                  />
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removePO(index)}
                className="text-destructive hover:text-destructive shrink-0 mt-5"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {!hideSaveButton && (
        <div className="flex justify-end pt-2">
          <Button onClick={handleSave} disabled={loading}>
            {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : <><Save className="h-4 w-4 mr-2" />Save Purchase Orders</>}
          </Button>
        </div>
      )}
    </div>
  );
}
