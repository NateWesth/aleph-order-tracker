import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Flame, Timer, CheckSquare, Loader2, Send } from "lucide-react";
import type { BuyingSheetRow } from "./types";
import { getPriorityLevel } from "./types";

interface QuickOrderViewProps {
  rows: BuyingSheetRow[];
  onBulkMarkOrdered: (skus: string[]) => Promise<void>;
  onGenerateEmail: (supplier: string) => void;
}

export function QuickOrderView({ rows, onBulkMarkOrdered, onGenerateEmail }: QuickOrderViewProps) {
  const [selectedSkus, setSelectedSkus] = useState<Set<string>>(new Set());
  const [ordering, setOrdering] = useState(false);

  // Only show items that need ordering, grouped by supplier
  const needsOrder = rows.filter(r => r.toOrder > 0);
  const groups = new Map<string, BuyingSheetRow[]>();
  for (const row of needsOrder) {
    const key = row.supplierName || "No Supplier";
    const existing = groups.get(key) || [];
    existing.push(row);
    groups.set(key, existing);
  }

  const toggleSku = (sku: string) => {
    setSelectedSkus(prev => {
      const next = new Set(prev);
      if (next.has(sku)) next.delete(sku); else next.add(sku);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedSkus.size === needsOrder.length) setSelectedSkus(new Set());
    else setSelectedSkus(new Set(needsOrder.map(r => r.sku)));
  };

  const selectSupplier = (items: BuyingSheetRow[]) => {
    const skus = items.map(r => r.sku);
    const allSelected = skus.every(s => selectedSkus.has(s));
    setSelectedSkus(prev => {
      const next = new Set(prev);
      if (allSelected) skus.forEach(s => next.delete(s));
      else skus.forEach(s => next.add(s));
      return next;
    });
  };

  const handleOrder = async () => {
    setOrdering(true);
    await onBulkMarkOrdered(Array.from(selectedSkus));
    setSelectedSkus(new Set());
    setOrdering(false);
  };

  if (needsOrder.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <CheckSquare className="h-12 w-12 text-emerald-500 mx-auto mb-3" />
          <p className="text-lg font-semibold text-foreground">All Covered!</p>
          <p className="text-sm text-muted-foreground">All items are covered by stock and purchase orders.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Sticky action bar */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border pb-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={selectAll}>
              {selectedSkus.size === needsOrder.length ? "Deselect All" : "Select All"}
            </Button>
            <span className="text-sm text-muted-foreground">
              {selectedSkus.size > 0 ? `${selectedSkus.size} of ${needsOrder.length} selected` : `${needsOrder.length} items need ordering`}
            </span>
          </div>
          {selectedSkus.size > 0 && (
            <Button onClick={handleOrder} disabled={ordering} className="gap-2">
              {ordering ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckSquare className="h-4 w-4" />}
              Mark {selectedSkus.size} as Ordered
            </Button>
          )}
        </div>
      </div>

      {Array.from(groups.entries()).map(([supplier, items]) => {
        const supplierTotal = items.reduce((s, r) => s + r.toOrder, 0);
        const allSelected = items.every(r => selectedSkus.has(r.sku));

        return (
          <Card key={supplier}>
            <div className="flex items-center justify-between p-3 border-b border-border bg-muted/30 rounded-t-xl">
              <div className="flex items-center gap-2">
                <Checkbox checked={allSelected} onCheckedChange={() => selectSupplier(items)} />
                <span className="font-semibold text-foreground">{supplier}</span>
                <Badge variant="secondary" className="text-[10px]">{items.length}</Badge>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => onGenerateEmail(supplier)}>
                  <Send className="h-3 w-3" />Email
                </Button>
                <Badge className="bg-primary/10 text-primary border-primary/20">{supplierTotal} units</Badge>
              </div>
            </div>
            <CardContent className="p-0 divide-y divide-border/50">
              {items.sort((a, b) => b.priorityScore - a.priorityScore).map(item => {
                const priority = getPriorityLevel(item.priorityScore);
                return (
                  <div key={item.sku} className={`flex items-center gap-3 p-3 hover:bg-muted/20 transition-colors ${selectedSkus.has(item.sku) ? "bg-primary/5" : ""}`}>
                    <Checkbox checked={selectedSkus.has(item.sku)} onCheckedChange={() => toggleSku(item.sku)} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm text-foreground truncate">{item.itemName}</span>
                        {item.hasUrgent && <Flame className="h-3 w-3 text-destructive shrink-0" />}
                        {item.stockoutRiskDays !== null && item.stockoutRiskDays <= 7 && (
                          <span className="text-[10px] text-destructive font-medium shrink-0">{item.stockoutRiskDays}d risk</span>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground font-mono">{item.sku} • {item.orders.length} order{item.orders.length !== 1 ? "s" : ""} • {item.daysWaiting}d waiting</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-bold text-primary">{item.toOrder}</p>
                      <p className="text-[10px] text-muted-foreground">of {item.totalNeeded}</p>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
