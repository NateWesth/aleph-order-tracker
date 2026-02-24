import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { CheckSquare, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { OrderWithCompany } from "../types/orderTypes";

interface BulkActionsBarProps {
  selectedOrders: OrderWithCompany[];
  onClearSelection: () => void;
  onActionComplete: () => void;
}

const STATUS_OPTIONS = [
  { value: "ordered", label: "Awaiting Stock" },
  { value: "in-stock", label: "In Stock" },
  { value: "in-progress", label: "In Progress" },
  { value: "ready", label: "Ready for Delivery" },
  { value: "delivered", label: "Delivered" },
];

export default function BulkActionsBar({ selectedOrders, onClearSelection, onActionComplete }: BulkActionsBarProps) {
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [newStatus, setNewStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  if (selectedOrders.length === 0) return null;

  const handleBulkStatusUpdate = async () => {
    if (!newStatus) return;
    setLoading(true);
    try {
      const ids = selectedOrders.map(o => o.id);
      
      const { error } = await supabase
        .from("orders")
        .update({ 
          status: newStatus, 
          updated_at: new Date().toISOString(),
          ...(newStatus === "completed" || newStatus === "delivered" 
            ? { completed_date: new Date().toISOString() } 
            : {})
        })
        .in("id", ids);

      if (error) throw error;

      toast({
        title: "Bulk Update Complete",
        description: `${ids.length} orders updated to "${newStatus}".`,
      });

      setShowStatusDialog(false);
      setNewStatus("");
      onClearSelection();
      onActionComplete();
    } catch (error: any) {
      console.error("Bulk update error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to update orders.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    setLoading(true);
    try {
      const ids = selectedOrders.map(o => o.id);
      const { error } = await supabase.from("orders").delete().in("id", ids);
      if (error) throw error;
      toast({ title: "Deleted", description: `${ids.length} orders deleted.` });
      onClearSelection();
      onActionComplete();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleBulkExport = () => {
    const headers = ["Order Number", "Company", "Status", "Urgency", "Created"];
    const rows = selectedOrders.map(o => [
      o.order_number,
      o.companyName || "",
      o.status || "pending",
      o.urgency || "normal",
      o.created_at ? new Date(o.created_at).toLocaleDateString() : "",
    ]);

    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `orders-export-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast({ title: "Exported", description: `${selectedOrders.length} orders exported to CSV.` });
  };

  return (
    <>
      <div className="sticky top-0 z-40 flex items-center justify-between gap-3 p-3 bg-primary/5 border border-primary/20 rounded-xl animate-in slide-in-from-top-2">
        <div className="flex items-center gap-2">
          <CheckSquare className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">{selectedOrders.length} selected</span>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={handleBulkExport}>
            Export CSV
          </Button>
          <Button size="sm" onClick={() => setShowStatusDialog(true)}>
            Update Status
          </Button>
          <Button size="sm" variant="destructive" onClick={handleBulkDelete} disabled={loading}>
            Delete
          </Button>
          <Button size="sm" variant="ghost" onClick={onClearSelection}>
            Clear
          </Button>
        </div>
      </div>

      <Dialog open={showStatusDialog} onOpenChange={setShowStatusDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Bulk Status Update</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Update {selectedOrders.length} orders to a new status:
            </p>
            <div className="space-y-2">
              <Label>New Status</Label>
              <Select value={newStatus} onValueChange={setNewStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="Select status..." />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowStatusDialog(false)}>Cancel</Button>
            <Button onClick={handleBulkStatusUpdate} disabled={!newStatus || loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Update {selectedOrders.length} Orders
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
