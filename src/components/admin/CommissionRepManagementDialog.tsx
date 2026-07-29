import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { CheckCircle2, DollarSign, Loader2, Lock, PlusCircle, ShieldAlert, Trash2, XCircle } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  repId: string;
  repName: string;
  periodMonth: string; // YYYY-MM
  isAdmin: boolean;
  grossCommission: number;
  invoiceCount: number;
  onChanged: () => void;
};

type Batch = {
  id: string;
  rep_id: string;
  period_month: string;
  status: "draft" | "approved" | "paid" | "void";
  invoice_count: number;
  gross_commission: number;
  adjustments_total: number;
  net_payout: number;
  notes: string | null;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  paid_by: string | null;
  paid_at: string | null;
  paid_reference: string | null;
  voided_by: string | null;
  voided_at: string | null;
  void_reason: string | null;
  created_at: string;
};

type Adjustment = {
  id: string;
  rep_id: string;
  period_month: string;
  batch_id: string | null;
  invoice_id: string | null;
  invoice_number: string | null;
  line_index: number | null;
  adjustment_type: "dispute" | "bonus" | "clawback" | "correction" | "manual";
  amount: number;
  status: "open" | "approved" | "applied" | "rejected";
  reason: string;
  note: string | null;
  created_by: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
};

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(n);

const statusVariant: Record<Batch["status"], "default" | "secondary" | "outline" | "destructive"> = {
  draft: "secondary",
  approved: "default",
  paid: "outline",
  void: "destructive",
};

const adjStatusVariant: Record<Adjustment["status"], "default" | "secondary" | "outline" | "destructive"> = {
  open: "secondary",
  approved: "default",
  applied: "outline",
  rejected: "destructive",
};

export default function CommissionRepManagementDialog({
  open,
  onOpenChange,
  repId,
  repName,
  periodMonth,
  isAdmin,
  grossCommission,
  invoiceCount,
  onChanged,
}: Props) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [tab, setTab] = useState<"batches" | "adjustments">("batches");
  const [loading, setLoading] = useState(false);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [newAdj, setNewAdj] = useState<{ type: Adjustment["adjustment_type"]; amount: string; reason: string; note: string; invoice_number: string }>({
    type: "correction",
    amount: "",
    reason: "",
    note: "",
    invoice_number: "",
  });
  const [batchNotes, setBatchNotes] = useState("");
  const [paidReference, setPaidReference] = useState("");
  const [voidReason, setVoidReason] = useState("");

  const periodDate = useMemo(() => `${periodMonth}-01`, [periodMonth]);

  const load = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    const [{ data: b }, { data: a }] = await Promise.all([
      supabase.from("commission_payout_batches").select("*").eq("rep_id", repId).eq("period_month", periodDate).order("created_at", { ascending: false }),
      supabase.from("commission_adjustments").select("*").eq("rep_id", repId).eq("period_month", periodDate).order("created_at", { ascending: false }),
    ]);
    setBatches((b as Batch[]) || []);
    setAdjustments((a as Adjustment[]) || []);
    setLoading(false);
  }, [open, repId, periodDate]);

  useEffect(() => { load(); }, [load]);

  const approvedAdjustmentsTotal = useMemo(
    () => adjustments.filter(a => a.status === "approved" || a.status === "applied").reduce((s, a) => s + Number(a.amount || 0), 0),
    [adjustments],
  );
  const netPayout = grossCommission + approvedAdjustmentsTotal;

  const createDraftBatch = async () => {
    const { error } = await supabase.from("commission_payout_batches").insert({
      rep_id: repId,
      period_month: periodDate,
      status: "draft",
      invoice_count: invoiceCount,
      gross_commission: grossCommission,
      adjustments_total: approvedAdjustmentsTotal,
      net_payout: netPayout,
      notes: batchNotes || null,
      created_by: user?.id ?? null,
    });
    if (error) { toast({ title: "Failed to create batch", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Draft batch created" });
    setBatchNotes("");
    load();
    onChanged();
  };

  const approveBatch = async (batch: Batch) => {
    const { error } = await supabase.from("commission_payout_batches").update({
      status: "approved",
      approved_by: user?.id ?? null,
      approved_at: new Date().toISOString(),
      adjustments_total: approvedAdjustmentsTotal,
      net_payout: batch.gross_commission + approvedAdjustmentsTotal,
    }).eq("id", batch.id);
    if (error) { toast({ title: "Approve failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Batch approved" });
    load(); onChanged();
  };

  const markPaid = async (batch: Batch) => {
    const { error } = await supabase.from("commission_payout_batches").update({
      status: "paid",
      paid_by: user?.id ?? null,
      paid_at: new Date().toISOString(),
      paid_reference: paidReference || null,
    }).eq("id", batch.id);
    if (error) { toast({ title: "Mark-paid failed", description: error.message, variant: "destructive" }); return; }
    setPaidReference("");
    toast({ title: "Batch marked paid" });
    load(); onChanged();
  };

  const voidBatch = async (batch: Batch) => {
    if (!voidReason.trim()) { toast({ title: "Void reason required", variant: "destructive" }); return; }
    const { error } = await supabase.from("commission_payout_batches").update({
      status: "void",
      voided_by: user?.id ?? null,
      voided_at: new Date().toISOString(),
      void_reason: voidReason,
    }).eq("id", batch.id);
    if (error) { toast({ title: "Void failed", description: error.message, variant: "destructive" }); return; }
    setVoidReason("");
    toast({ title: "Batch voided" });
    load(); onChanged();
  };

  const deleteBatch = async (batch: Batch) => {
    if (!confirm("Delete this batch permanently? This does not unlock invoices.")) return;
    const { error } = await supabase.from("commission_payout_batches").delete().eq("id", batch.id);
    if (error) { toast({ title: "Delete failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Batch deleted" });
    load(); onChanged();
  };

  const createAdjustment = async () => {
    const amount = Number(newAdj.amount);
    if (!Number.isFinite(amount) || amount === 0) { toast({ title: "Enter a non-zero amount", variant: "destructive" }); return; }
    if (!newAdj.reason.trim()) { toast({ title: "Reason is required", variant: "destructive" }); return; }
    const { error } = await supabase.from("commission_adjustments").insert({
      rep_id: repId,
      period_month: periodDate,
      adjustment_type: newAdj.type,
      amount,
      reason: newAdj.reason,
      note: newAdj.note || null,
      invoice_number: newAdj.invoice_number || null,
      created_by: user?.id ?? null,
      status: "open",
    });
    if (error) { toast({ title: "Add adjustment failed", description: error.message, variant: "destructive" }); return; }
    setNewAdj({ type: "correction", amount: "", reason: "", note: "", invoice_number: "" });
    toast({ title: "Adjustment logged" });
    load(); onChanged();
  };

  const setAdjustmentStatus = async (adj: Adjustment, status: Adjustment["status"]) => {
    const patch: any = { status };
    if (status === "approved" || status === "applied" || status === "rejected") {
      patch.resolved_by = user?.id ?? null;
      patch.resolved_at = new Date().toISOString();
    }
    const { error } = await supabase.from("commission_adjustments").update(patch).eq("id", adj.id);
    if (error) { toast({ title: "Update failed", description: error.message, variant: "destructive" }); return; }
    load(); onChanged();
  };

  const deleteAdjustment = async (adj: Adjustment) => {
    if (!confirm("Delete this adjustment?")) return;
    const { error } = await supabase.from("commission_adjustments").delete().eq("id", adj.id);
    if (error) { toast({ title: "Delete failed", description: error.message, variant: "destructive" }); return; }
    load(); onChanged();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            {repName} — {format(new Date(periodDate), "MMMM yyyy")}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap gap-2 mb-2 text-xs text-muted-foreground">
          <Badge variant="secondary">Gross {formatCurrency(grossCommission)}</Badge>
          <Badge variant="secondary">Adjustments {formatCurrency(approvedAdjustmentsTotal)}</Badge>
          <Badge variant="default">Net {formatCurrency(netPayout)}</Badge>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="batches"><Lock className="h-3.5 w-3.5 mr-1" />Payout batches</TabsTrigger>
            <TabsTrigger value="adjustments"><ShieldAlert className="h-3.5 w-3.5 mr-1" />Adjustments ({adjustments.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="batches" className="space-y-3">
            <Card>
              <CardContent className="pt-4 space-y-2">
                <Label>Create draft batch for this period</Label>
                <Textarea placeholder="Optional notes (visible in audit trail)" value={batchNotes} onChange={(e) => setBatchNotes(e.target.value)} rows={2} />
                <Button size="sm" onClick={createDraftBatch} className="gap-1">
                  <PlusCircle className="h-3.5 w-3.5" /> Create draft
                </Button>
              </CardContent>
            </Card>

            {loading && <Loader2 className="h-5 w-5 animate-spin mx-auto" />}
            {batches.length === 0 && !loading && (
              <p className="text-sm text-muted-foreground text-center py-4">No batches for this period yet.</p>
            )}

            {batches.map(b => (
              <Card key={b.id}>
                <CardContent className="pt-4 space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Badge variant={statusVariant[b.status]}>{b.status.toUpperCase()}</Badge>
                      <span className="text-sm font-medium">{formatCurrency(b.net_payout)}</span>
                      <span className="text-xs text-muted-foreground">gross {formatCurrency(b.gross_commission)} + adj {formatCurrency(b.adjustments_total)}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Created {format(new Date(b.created_at), "d MMM yyyy HH:mm")}
                    </div>
                  </div>
                  {b.notes && <p className="text-xs text-muted-foreground italic">"{b.notes}"</p>}
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    {b.approved_at && <div>Approved {format(new Date(b.approved_at), "d MMM yyyy HH:mm")}</div>}
                    {b.paid_at && <div>Paid {format(new Date(b.paid_at), "d MMM yyyy HH:mm")} {b.paid_reference && `· ref ${b.paid_reference}`}</div>}
                    {b.voided_at && <div>Voided {format(new Date(b.voided_at), "d MMM yyyy HH:mm")} — {b.void_reason}</div>}
                  </div>

                  {isAdmin && b.status !== "void" && b.status !== "paid" && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {b.status === "draft" && (
                        <Button size="sm" variant="default" onClick={() => approveBatch(b)} className="gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                        </Button>
                      )}
                      {b.status === "approved" && (
                        <div className="flex flex-wrap items-center gap-2 w-full">
                          <Input placeholder="Payment reference (optional)" value={paidReference} onChange={(e) => setPaidReference(e.target.value)} className="h-8 text-xs w-56" />
                          <Button size="sm" variant="default" onClick={() => markPaid(b)} className="gap-1">
                            <DollarSign className="h-3.5 w-3.5" /> Mark paid
                          </Button>
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-2">
                        <Input placeholder="Void reason" value={voidReason} onChange={(e) => setVoidReason(e.target.value)} className="h-8 text-xs w-48" />
                        <Button size="sm" variant="ghost" onClick={() => voidBatch(b)} className="gap-1 text-destructive">
                          <XCircle className="h-3.5 w-3.5" /> Void
                        </Button>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => deleteBatch(b)} className="gap-1 text-muted-foreground">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="adjustments" className="space-y-3">
            <Card>
              <CardContent className="pt-4 space-y-2">
                <Label className="text-sm">Log a new adjustment</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Select value={newAdj.type} onValueChange={(v) => setNewAdj(s => ({ ...s, type: v as any }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dispute">Dispute</SelectItem>
                      <SelectItem value="bonus">Bonus</SelectItem>
                      <SelectItem value="clawback">Clawback</SelectItem>
                      <SelectItem value="correction">Correction</SelectItem>
                      <SelectItem value="manual">Manual</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input placeholder="Amount (negative for clawback)" type="number" step="0.01" value={newAdj.amount} onChange={(e) => setNewAdj(s => ({ ...s, amount: e.target.value }))} />
                  <Input placeholder="Invoice # (optional)" value={newAdj.invoice_number} onChange={(e) => setNewAdj(s => ({ ...s, invoice_number: e.target.value }))} />
                  <Input placeholder="Reason (required)" value={newAdj.reason} onChange={(e) => setNewAdj(s => ({ ...s, reason: e.target.value }))} />
                </div>
                <Textarea placeholder="Additional notes (optional)" rows={2} value={newAdj.note} onChange={(e) => setNewAdj(s => ({ ...s, note: e.target.value }))} />
                <Button size="sm" onClick={createAdjustment} className="gap-1">
                  <PlusCircle className="h-3.5 w-3.5" /> Add adjustment
                </Button>
              </CardContent>
            </Card>

            {loading && <Loader2 className="h-5 w-5 animate-spin mx-auto" />}
            {adjustments.length === 0 && !loading && (
              <p className="text-sm text-muted-foreground text-center py-4">No adjustments logged.</p>
            )}

            {adjustments.map(a => (
              <Card key={a.id}>
                <CardContent className="pt-4 space-y-1">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={adjStatusVariant[a.status]}>{a.status.toUpperCase()}</Badge>
                      <Badge variant="outline" className="text-xs">{a.adjustment_type}</Badge>
                      <span className={"text-sm font-semibold " + (a.amount < 0 ? "text-destructive" : "text-primary")}>
                        {formatCurrency(a.amount)}
                      </span>
                      {a.invoice_number && <span className="text-xs text-muted-foreground">Inv {a.invoice_number}</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {format(new Date(a.created_at), "d MMM yyyy HH:mm")}
                    </div>
                  </div>
                  <p className="text-sm">{a.reason}</p>
                  {a.note && <p className="text-xs text-muted-foreground italic">{a.note}</p>}
                  {a.resolved_at && (
                    <p className="text-xs text-muted-foreground">Resolved {format(new Date(a.resolved_at), "d MMM yyyy HH:mm")}</p>
                  )}
                  {isAdmin && a.status === "open" && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button size="sm" variant="default" onClick={() => setAdjustmentStatus(a, "approved")} className="gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setAdjustmentStatus(a, "applied")} className="gap-1">
                        Applied
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setAdjustmentStatus(a, "rejected")} className="gap-1 text-destructive">
                        <XCircle className="h-3.5 w-3.5" /> Reject
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => deleteAdjustment(a)} className="gap-1 text-muted-foreground">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                  {isAdmin && a.status !== "open" && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button size="sm" variant="ghost" onClick={() => setAdjustmentStatus(a, "open")} className="text-xs">Reopen</Button>
                      <Button size="sm" variant="ghost" onClick={() => deleteAdjustment(a)} className="gap-1 text-muted-foreground">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
