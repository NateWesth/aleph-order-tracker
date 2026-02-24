import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, TrendingUp, TrendingDown, Clock, Package, Truck } from "lucide-react";
import { differenceInDays } from "date-fns";
import { PageSkeleton } from "@/components/ui/PageSkeleton";

interface SupplierScore {
  id: string;
  name: string;
  code: string;
  totalPOs: number;
  completedOrders: number;
  avgDeliveryDays: number;
  onTimeRate: number;
  activeOrders: number;
}

export default function SupplierScorecard() {
  const [scores, setScores] = useState<SupplierScore[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [suppliersRes, posRes, ordersRes] = await Promise.all([
          supabase.from("suppliers").select("*"),
          supabase.from("order_purchase_orders").select("*"),
          supabase.from("orders").select("id, status, created_at, completed_date"),
        ]);

        const suppliers = suppliersRes.data || [];
        const pos = posRes.data || [];
        const orders = ordersRes.data || [];

        const orderMap = new Map(orders.map(o => [o.id, o]));

        const supplierScores: SupplierScore[] = suppliers.map(supplier => {
          const supplierPOs = pos.filter(po => po.supplier_id === supplier.id);
          const supplierOrders = supplierPOs.map(po => orderMap.get(po.order_id)).filter(Boolean);

          const completed = supplierOrders.filter(o => 
            o && (o.status === "completed" || o.status === "delivered") && o.completed_date
          );
          const active = supplierOrders.filter(o => 
            o && o.status !== "completed" && o.status !== "delivered"
          );

          let avgDays = 0;
          let onTimeCount = 0;
          if (completed.length > 0) {
            const totalDays = completed.reduce((sum, o) => {
              const days = differenceInDays(new Date(o!.completed_date!), new Date(o!.created_at!));
              if (days <= 14) onTimeCount++; // 14 days = on time threshold
              return sum + days;
            }, 0);
            avgDays = Math.round(totalDays / completed.length);
          }

          return {
            id: supplier.id,
            name: supplier.name,
            code: supplier.code,
            totalPOs: supplierPOs.length,
            completedOrders: completed.length,
            avgDeliveryDays: avgDays,
            onTimeRate: completed.length > 0 ? Math.round((onTimeCount / completed.length) * 100) : 0,
            activeOrders: active.length,
          };
        })
        .filter(s => s.totalPOs > 0)
        .sort((a, b) => b.totalPOs - a.totalPOs);

        setScores(supplierScores);
      } catch (error) {
        console.error("Error fetching supplier scores:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return <PageSkeleton variant="scorecard" />;
  }

  if (scores.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        No supplier data available. Link purchase orders to suppliers to see performance data.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Truck className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">Supplier Performance</h3>
      </div>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {scores.map((supplier) => (
          <Card key={supplier.id} className="border border-border">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold truncate">{supplier.name}</CardTitle>
                <Badge variant="secondary" className="text-xs shrink-0">{supplier.code}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Total POs</p>
                  <p className="text-lg font-bold flex items-center gap-1">
                    <Package className="h-4 w-4 text-primary" />
                    {supplier.totalPOs}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Active</p>
                  <p className="text-lg font-bold">{supplier.activeOrders}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" /> Avg. Delivery
                  </p>
                  <p className="text-sm font-medium">
                    {supplier.completedOrders > 0 ? `${supplier.avgDeliveryDays} days` : "—"}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">On-Time Rate</p>
                  <p className="text-sm font-medium flex items-center gap-1">
                    {supplier.completedOrders > 0 ? (
                      <>
                        {supplier.onTimeRate >= 80 ? (
                          <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                        ) : (
                          <TrendingDown className="h-3.5 w-3.5 text-red-500" />
                        )}
                        {supplier.onTimeRate}%
                      </>
                    ) : "—"}
                  </p>
                </div>
              </div>

              {/* Performance bar */}
              {supplier.completedOrders > 0 && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Reliability</span>
                    <span>{supplier.onTimeRate}%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        supplier.onTimeRate >= 80
                          ? "bg-emerald-500"
                          : supplier.onTimeRate >= 50
                          ? "bg-amber-500"
                          : "bg-red-500"
                      }`}
                      style={{ width: `${supplier.onTimeRate}%` }}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
