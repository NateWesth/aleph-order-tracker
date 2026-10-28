import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { UserPlus, ChevronDown, ChevronUp } from "lucide-react";

export type UnassignedCustomer = { customer_name: string; invoice_count: number; sub_total: number };

type Props = {
  customers: UnassignedCustomer[];
  reps: { id: string; name: string }[];
  formatCurrency: (n: number) => string;
  onAssigned: () => void;
};

const norm = (v: string) => v.trim().replace(/\s+/g, " ").toLowerCase();

export default function UnassignedClientsPanel({ customers, reps, formatCurrency, onAssigned }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  if (customers.length === 0) return null;
  const total = customers.reduce((s, c) => s + c.sub_total, 0);

  const assign = async (c: UnassignedCustomer) => {
    const repId = choice[c.customer_name];
    if (!repId) return;
    setSaving(c.customer_name);
    try {
      const { data: all, error } = await supabase.from("companies").select("id, name, code");
      if (error) throw error;
      let company = (all || []).find((x) => norm(x.name) === norm(c.customer_name));
      if (!company) {
        const slug = c.customer_name.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30);
        const { data: created, error: insErr } = await supabase
          .from("companies")
          .insert({ name: c.customer_name, code: `ZOHO-${slug}-${Date.now().toString(36).toUpperCase()}` })
          .select("id, name, code")
          .single();
        if (insErr) throw insErr;
        company = created;
      }
      const { error: aErr } = await supabase.from("rep_company_assignments").insert({ rep_id: repId, company_id: company!.id });
      if (aErr) throw aErr;
      toast({ title: "Client assigned", description: `${c.customer_name} → ${reps.find((r) => r.id === repId)?.name}` });
      onAssigned();
    } catch (e: any) {
      toast({ title: "Could not assign client", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="rounded-2xl border border-logo-violet/40 bg-logo-violet/5 p-3">
      <button type="button" className="flex w-full items-center justify-between gap-2 text-left" onClick={() => setOpen((o) => !o)}>
        <div className="flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-logo-violet" />
          <p className="text-sm font-semibold">{customers.length} clients have no rep</p>
          <Badge variant="outline" className="text-[10px]">{formatCurrency(total)} not counted</Badge>
        </div>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && (
        <div className="mt-3 max-h-96 space-y-1.5 overflow-y-auto">
          {customers.map((c) => (
            <div key={c.customer_name} className="flex flex-wrap items-center gap-2 rounded-xl bg-card p-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{c.customer_name}</p>
                <p className="text-[11px] text-muted-foreground">{c.invoice_count} invoice{c.invoice_count === 1 ? "" : "s"} · {formatCurrency(c.sub_total)} excl. VAT</p>
              </div>
              <Select value={choice[c.customer_name] || undefined} onValueChange={(v) => setChoice((p) => ({ ...p, [c.customer_name]: v }))}>
                <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="Choose rep" /></SelectTrigger>
                <SelectContent>
                  {reps.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button size="sm" className="h-8" disabled={!choice[c.customer_name] || saving === c.customer_name} onClick={() => void assign(c)}>
                {saving === c.customer_name ? "Saving…" : "Assign"}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
