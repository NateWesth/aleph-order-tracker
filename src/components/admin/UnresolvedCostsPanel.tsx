import { useState } from "react";
import { AlertTriangle, Save, ChevronDown, ChevronRight, CheckCircle2, Loader2 } from "lucide-react";
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

const keyOf = (i: UnresolvedCostItem) =>
  `${i.item_name.toLowerCase().trim()}||${i.item_description.toLowerCase().trim()}`;

const saveCost = async (item: UnresolvedCostItem, cost: number) => {
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
  if (error) {
    const { data: existing } = await supabase
      .from("commission_item_cost_overrides")
      .select("id")
      .ilike("item_name", item.item_name)
      .ilike("item_description", item.item_description)
      .maybeSingle();
    if (existing?.id) {
      const { error: updErr } = await supabase
        .from("commission_item_cost_overrides")
        .update({ cost })
        .eq("id", existing.id);
      if (updErr) throw updErr;
    } else {
      const { error: insErr } = await supabase
        .from("commission_item_cost_overrides")
        .insert({ item_name: item.item_name, item_description: item.item_description, cost });
      if (insErr) throw insErr;
    }
  }
};

export const UnresolvedCostsPanel = ({ items, onSaved }: Props) => {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(true);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  const [savingAll, setSavingAll] = useState(false);

  const visibleItems = items.filter((i) => !savedKeys.has(keyOf(i)));
  if (!items || items.length === 0 || visibleItems.length === 0) return null;

  const save = async (item: UnresolvedCostItem) => {
    const k = keyOf(item);
    const raw = values[k];
    const cost = Number(raw);
    if (!raw || !Number.isFinite(cost) || cost <= 0) {
      toast({ title: "Enter a valid cost greater than 0", variant: "destructive" });
      return;
    }
    setSaving((s) => ({ ...s, [k]: true }));
    try {
      await saveCost(item, cost);
      toast({ title: "Cost saved", description: `${item.item_name} — R${cost.toFixed(2)}` });
      setSavedKeys((s) => {
        const next = new Set(s);
        next.add(k);
        return next;
      });
      setValues((v) => ({ ...v, [k]: "" }));
      onSaved();
    } catch (err: any) {
      toast({ title: "Failed to save cost", description: err?.message ?? String(err), variant: "destructive" });
    } finally {
      setSaving((s) => ({ ...s, [k]: false }));
    }
  };

  const saveAll = async () => {
    const pending = visibleItems.filter((i) => {
      const raw = values[keyOf(i)];
      const n = Number(raw);
      return raw && Number.isFinite(n) && n > 0;
    });
    if (pending.length === 0) {
      toast({ title: "No costs entered", description: "Enter a cost for at least one item.", variant: "destructive" });
      return;
    }
    setSavingAll(true);
    let ok = 0;
    let failed = 0;
    for (const item of pending) {
      const k = keyOf(item);
      const cost = Number(values[k]);
      try {
        await saveCost(item, cost);
        ok++;
        setSavedKeys((s) => {
          const next = new Set(s);
          next.add(k);
          return next;
        });
        setValues((v) => ({ ...v, [k]: "" }));
      } catch {
        failed++;
      }
    }
    setSavingAll(false);
    toast({
      title: `Saved ${ok} cost${ok === 1 ? "" : "s"}`,
      description: failed > 0 ? `${failed} failed to save` : "Commission report will refresh",
      variant: failed > 0 ? "destructive" : "default",
    });
    onSaved();
  };

  const pendingCount = visibleItems.filter((i) => {
    const raw = values[keyOf(i)];
    const n = Number(raw);
    return raw && Number.isFinite(n) && n > 0;
  }).length;

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/5">
      <div className="w-full flex items-center gap-2 p-3">
        <button
          type="button"
          className="flex items-center gap-2 text-left flex-1 min-w-0"
          onClick={() => setExpanded((e) => !e)}
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <span className="font-medium text-amber-800 dark:text-amber-200">
            {visibleItems.length} item{visibleItems.length === 1 ? "" : "s"} with no vendor-bill cost match
          </span>
          <span className="text-xs text-muted-foreground ml-2 truncate">
            Enter cost (ex VAT) so commission can be calculated
          </span>
        </button>
        <Button
          size="sm"
          onClick={saveAll}
          disabled={savingAll || pendingCount === 0}
        >
          {savingAll ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
          Save all{pendingCount > 0 ? ` (${pendingCount})` : ""}
        </Button>
      </div>
      {expanded && (
        <div className="border-t border-amber-500/40 divide-y divide-amber-500/20">
          {visibleItems.map((item) => {
            const k = keyOf(item);
            const isSaving = !!saving[k];
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
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        save(item);
                      }
                    }}
                    className="w-32"
                    disabled={isSaving}
                  />
                  <Button
                    size="sm"
                    onClick={() => save(item)}
                    disabled={isSaving}
                  >
                    {isSaving ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                    ) : (
                      <Save className="h-3.5 w-3.5 mr-1" />
                    )}
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
