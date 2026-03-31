import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Send, Mail, Package, Flame, Timer, TrendingUp, TrendingDown, Minus, BarChart3, Sun, Snowflake, ChevronDown, ChevronRight } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useState } from "react";
import type { BuyingSheetRow } from "./types";

interface SupplierCardsViewProps {
  rows: BuyingSheetRow[];
  notes: Record<string, string>;
  onGenerateEmail: (supplier: string) => void;
  onCopyEmail: (email: string) => void;
}

export function SupplierCardsView({ rows, notes, onGenerateEmail, onCopyEmail }: SupplierCardsViewProps) {
  const [expandedSuppliers, setExpandedSuppliers] = useState<Set<string>>(new Set());

  const groups = new Map<string, BuyingSheetRow[]>();
  for (const row of rows) {
    const key = row.supplierName || "No Supplier";
    const existing = groups.get(key) || [];
    existing.push(row);
    groups.set(key, existing);
  }

  const sortedGroups = Array.from(groups.entries()).sort((a, b) => {
    const aPriority = a[1].reduce((s, r) => s + r.priorityScore, 0);
    const bPriority = b[1].reduce((s, r) => s + r.priorityScore, 0);
    return bPriority - aPriority;
  });

  const toggleSupplier = (supplier: string) => {
    setExpandedSuppliers(prev => {
      const next = new Set(prev);
      if (next.has(supplier)) next.delete(supplier); else next.add(supplier);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      {sortedGroups.map(([supplier, items]) => {
        const totalToOrder = items.reduce((s, r) => s + r.toOrder, 0);
        const totalNeeded = items.reduce((s, r) => s + r.totalNeeded, 0);
        const urgentCount = items.filter(r => r.hasUrgent).length;
        const stockoutCount = items.filter(r => r.stockoutRiskDays !== null && r.stockoutRiskDays <= 7).length;
        const email = items.find(i => i.supplierEmail)?.supplierEmail;
        const avgLeadTime = items.filter(i => i.avgLeadTimeDays !== null).reduce((s, r) => s + (r.avgLeadTimeDays || 0), 0) / Math.max(1, items.filter(i => i.avgLeadTimeDays !== null).length);
        const isExpanded = expandedSuppliers.has(supplier);

        return (
          <Card key={supplier} className={`transition-all ${urgentCount > 0 ? "border-destructive/30" : stockoutCount > 0 ? "border-orange-500/30" : ""}`}>
            <Collapsible open={isExpanded} onOpenChange={() => toggleSupplier(supplier)}>
              <CollapsibleTrigger asChild>
                <button className="w-full p-4 flex items-center justify-between hover:bg-muted/30 transition-colors rounded-t-xl">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Package className="h-5 w-5 text-primary" />
                    </div>
                    <div className="text-left">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground">{supplier}</span>
                        <Badge variant="secondary" className="text-[10px]">{items.length} items</Badge>
                        {urgentCount > 0 && <Badge variant="destructive" className="text-[10px] gap-0.5"><Flame className="h-2.5 w-2.5" />{urgentCount}</Badge>}
                        {stockoutCount > 0 && <Badge className="text-[10px] gap-0.5 bg-orange-500 text-white"><Timer className="h-2.5 w-2.5" />{stockoutCount}</Badge>}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                        {email && <span>{email}</span>}
                        {avgLeadTime > 0 && <span>~{Math.round(avgLeadTime)}d lead time</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">To Order</p>
                      <p className="text-xl font-bold text-primary">{totalToOrder}</p>
                    </div>
                    <div className="text-right hidden sm:block">
                      <p className="text-xs text-muted-foreground">Total Needed</p>
                      <p className="text-lg font-semibold text-foreground">{totalNeeded}</p>
                    </div>
                    {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                  </div>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="p-0">
                  {/* Action bar */}
                  <div className="flex items-center gap-2 px-4 py-2 border-t border-b border-border bg-muted/20">
                    <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => onGenerateEmail(supplier)}>
                      <Send className="h-3 w-3" />Draft Email
                    </Button>
                    {email && (
                      <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => onCopyEmail(email)}>
                        <Mail className="h-3 w-3" />Copy Email
                      </Button>
                    )}
                    <span className="ml-auto text-xs text-muted-foreground">{items.length} SKUs • {totalToOrder} units to order</span>
                  </div>
                  {/* Items grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-0">
                    {items.sort((a, b) => b.priorityScore - a.priorityScore).map(item => (
                      <div key={item.sku} className={`p-3 border-b border-r border-border/50 last:border-b-0 ${item.hasUrgent ? "bg-destructive/5" : ""}`}>
                        <div className="flex items-start justify-between mb-1.5">
                          <div>
                            <p className="font-mono text-[10px] text-muted-foreground">{item.sku}</p>
                            <p className="text-sm font-medium text-foreground leading-tight mt-0.5">{item.itemName}</p>
                          </div>
                          <div className="flex items-center gap-1">
                            {item.hasUrgent && <Flame className="h-3.5 w-3.5 text-destructive" />}
                            {item.seasonalPattern === "peak" && <Sun className="h-3.5 w-3.5 text-orange-500" />}
                            {item.seasonalPattern === "low" && <Snowflake className="h-3.5 w-3.5 text-blue-500" />}
                            {item.demandTrend === "up" && <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />}
                            {item.demandTrend === "down" && <TrendingDown className="h-3.5 w-3.5 text-destructive" />}
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-xs mb-2">
                          <div><span className="text-muted-foreground">Needed:</span> <span className="font-semibold">{item.totalNeeded}</span></div>
                          <div><span className="text-muted-foreground">Stock:</span> <span className="font-medium">{item.stockOnHand}</span></div>
                          <div><span className="text-muted-foreground">On PO:</span> <span className="font-medium">{item.onPurchaseOrder}</span></div>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 flex-1">
                            <Progress
                              value={item.coveragePercent}
                              className={`h-1.5 flex-1 ${item.coveragePercent >= 100 ? "[&>div]:bg-emerald-500" : item.coveragePercent >= 50 ? "[&>div]:bg-amber-500" : "[&>div]:bg-destructive"}`}
                            />
                            <span className="text-[10px] text-muted-foreground w-7">{item.coveragePercent}%</span>
                          </div>
                          {item.toOrder > 0 && (
                            <Badge variant="destructive" className="text-xs font-bold ml-2">Order {item.toOrder}</Badge>
                          )}
                        </div>
                        {item.stockoutRiskDays !== null && item.stockoutRiskDays <= 14 && (
                          <div className={`mt-1.5 text-[10px] px-1.5 py-0.5 rounded inline-flex items-center gap-1 ${item.stockoutRiskDays <= 7 ? "bg-destructive/10 text-destructive" : "bg-orange-500/10 text-orange-600"}`}>
                            <Timer className="h-2.5 w-2.5" />{item.stockoutRiskDays}d until stockout
                          </div>
                        )}
                        {notes[item.sku] && (
                          <p className="mt-1.5 text-[10px] text-muted-foreground italic border-l-2 border-primary/30 pl-1.5">{notes[item.sku]}</p>
                        )}
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {item.orders.map(o => o.orderNumber).join(", ")} • {item.daysWaiting}d waiting
                        </p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        );
      })}
    </div>
  );
}
