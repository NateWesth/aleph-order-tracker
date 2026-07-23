import { useState } from "react";
import { AlertTriangle, Save, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export type UnresolvedCostItem = {
  item_name: string;
  item_description: string;
  invoice_number: string;
  customer_name: string;
  quantity: number;
  sell_rate: number;
  sub_total: number;
  occurrences: number;
};

interface Props {
  items: UnresolvedCostItem[];
  onSaved: () => void;
}

export const UnresolvedCostsPanel = ({ items, onSaved }: Props) => {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(true);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  if (!items || items.length === 0) return null;

  const keyOf = (i: UnresolvedCostItem) =>
    `${i.item_name.toLowerCase().trim()}||${i.item_description.toLowerCase().trim()}`;

  const save = async (item: UnresolvedCostItem) => {
    const k = keyOf(item);
    const raw = values[k];
    const cost = Number(raw);
    if (!raw || !Number.isFinite(cost) || cost <= 0) {
      toast({ title: "Enter a valid cost greater than 0", variant: "destructive" });
      return;
    }
    setSaving(k);
    const { error } = await supabase
      .from("commission_item_cost_overrides")
      .upsert(
        {
          item_name: item.item_name,
          item_description: item.item_description,
          cost,
        },
        { onConflict: "item_name,item_description" },
      );
    setSaving(null);
    if (error) {
      // upsert onConflict on functional index isn't reliable — try manual update fallback
      const { data: existing } = await supabase
        .from("commission_item_cost_overrides")
        .select("id")
        .ilike("item_name", item.item_name)
        .ilike("item_description", item.item_description)
        .maybeSingle();
      if (existing?.id) {
        await supabase
          .from("commission_item_cost_overrides")
          .update({ cost })
          .eq("id", existing.id);
      } else {
        const { error: insErr } = await supabase
          .from("commission_item_cost_overrides")
          .insert({ item_name: item.item_name, item_description: item.item_description, cost });
        if (insErr) {
          toast({ title: "Failed to save cost", description: insErr.message, variant: "destructive" });
          return;
        }
      }
    }
    toast({ title: "Cost saved", description: `${item.item_name} — R${cost.toFixed(2)}` });
    setValues((v) => ({ ...v, [k]: "" }));
    onSaved();
  };

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/5">
      <button
        type="button"
        className="w-full flex items-center gap-2 p-3 text-left"
        onClick={() => setExpanded((e) => !e)}
      >
        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <span className="font-medium text-amber-800 dark:text-amber-200">
          {items.length} item{items.length === 1 ? "" : "s"} with no vendor-bill cost match
        </span>
        <span className="text-xs text-muted-foreground ml-auto">
          Enter cost (ex VAT) so commission can be calculated
        </span>
      </button>
      {expanded && (
        <div className="border-t border-amber-500/40 divide-y divide-amber-500/20">
          {items.map((item) => {
            const k = keyOf(item);
            return (
              <div key={k} className="p-3 flex flex-col gap-2 md:flex-row md:items-center">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{item.item_name || "(no name)"}</div>
                  {item.item_description && (
                    <div className="text-xs text-muted-foreground truncate">
                      {item.item_description}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground">
                    Seen on {item.occurrences} line{item.occurrences === 1 ? "" : "s"} · e.g. {item.invoice_number} · {item.customer_name} · sold @ R{item.sell_rate.toFixed(2)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Cost ex VAT"
                    value={values[k] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [k]: e.target.value }))}
                    className="w-32"
                  />
                  <Button
                    size="sm"
                    onClick={() => save(item)}
                    disabled={saving === k}
                  >
                    <Save className="h-3.5 w-3.5 mr-1" />
                    Save
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
