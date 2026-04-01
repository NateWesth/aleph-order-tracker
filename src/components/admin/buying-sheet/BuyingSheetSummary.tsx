import { Card, CardContent } from "@/components/ui/card";

interface SummaryProps {
  totals: { needed: number; inStock: number; onPO: number; toOrder: number; urgent: number; stockoutRisk: number; estimatedCost: number; abcA: number };
  avgDaysWaiting: number;
  supplierCount: number;
}

export function BuyingSheetSummary({ totals, avgDaysWaiting, supplierCount }: SummaryProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-10 gap-2">
      <Card className="bg-card/60">
        <CardContent className="p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Total Needed</p>
          <p className="text-lg font-bold text-foreground mt-0.5">{totals.needed.toLocaleString()}</p>
        </CardContent>
      </Card>
      <Card className="bg-card/60">
        <CardContent className="p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">In Stock</p>
          <p className="text-lg font-bold text-accent-foreground mt-0.5">{totals.inStock.toLocaleString()}</p>
        </CardContent>
      </Card>
      <Card className="bg-card/60">
        <CardContent className="p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">On PO</p>
          <p className="text-lg font-bold text-primary mt-0.5">{totals.onPO.toLocaleString()}</p>
        </CardContent>
      </Card>
      <Card className="bg-primary/10 border-primary/20">
        <CardContent className="p-3">
          <p className="text-[10px] uppercase tracking-wider text-primary font-medium">To Order</p>
          <p className="text-lg font-bold text-primary mt-0.5">{totals.toOrder.toLocaleString()}</p>
        </CardContent>
      </Card>
      <Card className={totals.urgent > 0 ? "bg-destructive/10 border-destructive/20" : "bg-card/60"}>
        <CardContent className="p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Urgent</p>
          <p className={`text-lg font-bold mt-0.5 ${totals.urgent > 0 ? "text-destructive" : "text-foreground"}`}>{totals.urgent}</p>
        </CardContent>
      </Card>
      <Card className={totals.stockoutRisk > 0 ? "bg-destructive/10 border-destructive/20" : "bg-card/60"}>
        <CardContent className="p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Stockout Risk</p>
          <p className={`text-lg font-bold mt-0.5 ${totals.stockoutRisk > 0 ? "text-destructive" : "text-foreground"}`}>{totals.stockoutRisk}</p>
        </CardContent>
      </Card>
      <Card className="bg-card/60">
        <CardContent className="p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Avg Wait</p>
          <p className={`text-lg font-bold mt-0.5 ${avgDaysWaiting > 7 ? "text-destructive" : avgDaysWaiting > 3 ? "text-orange-500" : "text-foreground"}`}>
            {avgDaysWaiting}d
          </p>
        </CardContent>
      </Card>
      <Card className="bg-card/60">
        <CardContent className="p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Suppliers</p>
          <p className="text-lg font-bold text-foreground mt-0.5">{supplierCount}</p>
        </CardContent>
      </Card>
      <Card className="bg-card/60">
        <CardContent className="p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Class A Items</p>
          <p className="text-lg font-bold text-destructive mt-0.5">{totals.abcA}</p>
        </CardContent>
      </Card>
      {totals.estimatedCost > 0 && (
        <Card className="bg-card/60">
          <CardContent className="p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Est. Cost</p>
            <p className="text-lg font-bold text-foreground mt-0.5">R{totals.estimatedCost.toLocaleString()}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
