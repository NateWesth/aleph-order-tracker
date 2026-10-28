import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Banknote, ChevronDown, ChevronUp } from "lucide-react";

export type CashInvoice = {
  invoice_id: string;
  invoice_number: string;
  customer_name: string;
  date: string;
  sub_total: number;
  rep_id: string | null;
};

type Props = {
  invoices: CashInvoice[];
  reps: { id: string; name: string }[];
  formatCurrency: (n: number) => string;
  onChanged: () => void;
};

export default function CashInvoicesPanel({ invoices, reps, formatCurrency, onChanged }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [savedLinks, setSavedLinks] = useState<Record<string, string | null>>({});
  // Linked invoices leave this list and appear on the rep's statement instead.
  const displayedInvoices = invoices
    .map((inv) => ({ ...inv, rep_id: Object.prototype.hasOwnProperty.call(savedLinks, inv.invoice_id) ? savedLinks[inv.invoice_id] : inv.rep_id }))
    .filter((i) => !i.rep_id);
  if (displayedInvoices.length === 0) return null;
  const unlinked = displayedInvoices;

  const link = async (inv: CashInvoice, repId: string) => {
    if (saving) return;
    setSaving(inv.invoice_id);
    try {
      const table = supabase.from("commission_invoice_links");
      if (repId === "none") {
        const { error } = await table.delete().eq("invoice_id", inv.invoice_id);
        if (error) throw error;
        const { data, error: readError } = await table.select("rep_id").eq("invoice_id", inv.invoice_id).maybeSingle();
        if (readError) throw readError;
        if (data) throw new Error("Invoice could not be unlinked. Check your commission editing permission.");
      } else {
        const { data, error } = await table.upsert({
            invoice_id: inv.invoice_id,
            invoice_number: inv.invoice_number,
            customer_name: inv.customer_name,
            invoice_date: inv.date || null,
            rep_id: repId,
          }, { onConflict: "invoice_id" }).select("rep_id").single();
        if (error) throw error;
        if (data.rep_id !== repId) throw new Error("Saved invoice link did not match the selected rep.");
      }
      setSavedLinks((prev) => ({ ...prev, [inv.invoice_id]: repId === "none" ? null : repId }));
      toast({
        title: repId === "none" ? "Invoice unlinked" : "Invoice linked",
        description: repId === "none" ? inv.invoice_number : `${inv.invoice_number} → ${reps.find((r) => r.id === repId)?.name}`,
      });
      onChanged();
    } catch (e: any) {
      toast({ title: "Could not save link", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="rounded-2xl border border-primary/30 bg-primary/5 p-3">
      <Button type="button" variant="ghost" className="flex h-auto w-full items-center justify-between gap-2 whitespace-normal text-left" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <div className="flex flex-wrap items-center gap-2">
          <Banknote className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">Cash (COD) invoices</p>
          <Badge variant="outline" className="text-[10px]">{invoices.length - unlinked.length} linked</Badge>
          {unlinked.length > 0 && (
            <Badge variant="outline" className="text-[10px] border-warning/50 text-warning">
              {unlinked.length} not linked · {formatCurrency(unlinked.reduce((s, i) => s + i.sub_total, 0))}
            </Badge>
          )}
        </div>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </Button>
      {open && (
        <div className="mt-3 max-h-96 space-y-1.5 overflow-y-auto">
          {displayedInvoices.map((inv) => (
            <div key={inv.invoice_id} className="flex flex-wrap items-center gap-2 rounded-xl bg-card p-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{inv.invoice_number} · {inv.customer_name}</p>
                <p className="text-[11px] text-muted-foreground">{inv.date} · {formatCurrency(inv.sub_total)} excl. VAT</p>
              </div>
              <Select
                value={inv.rep_id || "none"}
                disabled={saving !== null}
                onValueChange={(v) => void link(inv, v)}
              >
                <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder="Link to rep" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not linked</SelectItem>
                  {reps.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
