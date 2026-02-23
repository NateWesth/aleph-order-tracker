import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Brain, RefreshCw, AlertTriangle, TrendingUp, Package, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Prediction {
  type: "reorder" | "delay" | "trend" | "opportunity";
  title: string;
  description: string;
  confidence: "high" | "medium" | "low";
  urgency: "urgent" | "soon" | "informational";
}

export default function PredictiveInsights() {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const { toast } = useToast();

  const fetchPredictions = async () => {
    setLoading(true);
    try {
      // Gather data for analysis
      const [ordersRes, itemsRes, completedRes] = await Promise.all([
        supabase.from("orders").select("id, order_number, status, urgency, created_at, updated_at, company_id, description").neq("status", "delivered").order("created_at", { ascending: false }),
        supabase.from("order_items").select("id, name, code, quantity, stock_status, order_id, created_at"),
        supabase.from("orders").select("id, order_number, status, created_at, completed_date, company_id, description").eq("status", "delivered").order("completed_date", { ascending: false }).limit(50),
      ]);

      const activeOrders = ordersRes.data || [];
      const allItems = itemsRes.data || [];
      const completedOrders = completedRes.data || [];

      // Analyze patterns locally for fast insights
      const localPredictions: Prediction[] = [];

      // 1. Items stuck awaiting stock for too long
      const awaitingItems = allItems.filter(i => i.stock_status === "awaiting");
      const oldAwaitingItems = awaitingItems.filter(i => {
        const created = new Date(i.created_at);
        const daysSince = (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24);
        return daysSince > 5;
      });

      if (oldAwaitingItems.length > 0) {
        const itemNames = [...new Set(oldAwaitingItems.map(i => i.name))].slice(0, 3);
        localPredictions.push({
          type: "reorder",
          title: `${oldAwaitingItems.length} items stuck awaiting stock`,
          description: `Items like ${itemNames.join(", ")} have been awaiting stock for 5+ days. Consider contacting suppliers or finding alternatives.`,
          confidence: "high",
          urgency: "urgent",
        });
      }

      // 2. Orders aging in pipeline
      const staleOrders = activeOrders.filter(o => {
        const updated = new Date(o.updated_at || o.created_at || "");
        const daysSince = (Date.now() - updated.getTime()) / (1000 * 60 * 60 * 24);
        return daysSince > 3 && o.status !== "ready";
      });

      if (staleOrders.length > 0) {
        localPredictions.push({
          type: "delay",
          title: `${staleOrders.length} orders haven't progressed in 3+ days`,
          description: `Orders ${staleOrders.slice(0, 3).map(o => o.order_number).join(", ")} may be stuck. Review and take action.`,
          confidence: "high",
          urgency: "soon",
        });
      }

      // 3. Popular items trend
      const itemCounts = new Map<string, number>();
      allItems.forEach(i => {
        itemCounts.set(i.name, (itemCounts.get(i.name) || 0) + i.quantity);
      });
      const topItems = [...itemCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);

      if (topItems.length > 0) {
        localPredictions.push({
          type: "trend",
          title: "Most ordered items",
          description: `Top items: ${topItems.map(([name, qty]) => `${name} (${qty} units)`).join(", ")}. Consider pre-stocking these.`,
          confidence: "medium",
          urgency: "informational",
        });
      }

      // 4. Completion velocity
      if (completedOrders.length >= 5) {
        const completionTimes = completedOrders
          .filter(o => o.completed_date && o.created_at)
          .map(o => {
            const created = new Date(o.created_at!);
            const completed = new Date(o.completed_date!);
            return (completed.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
          })
          .filter(d => d > 0);

        if (completionTimes.length > 0) {
          const avgDays = (completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length).toFixed(1);
          localPredictions.push({
            type: "trend",
            title: `Average completion: ${avgDays} days`,
            description: `Based on ${completionTimes.length} completed orders. ${Number(avgDays) > 7 ? "This is above average — look for bottlenecks." : "Good velocity!"}`,
            confidence: "high",
            urgency: "informational",
          });
        }
      }

      // 5. Pipeline imbalance
      const statusCounts = {
        ordered: activeOrders.filter(o => o.status === "ordered").length,
        "in-stock": activeOrders.filter(o => o.status === "in-stock").length,
        "in-progress": activeOrders.filter(o => o.status === "in-progress").length,
        ready: activeOrders.filter(o => o.status === "ready").length,
      };

      if (statusCounts.ready > 5) {
        localPredictions.push({
          type: "opportunity",
          title: `${statusCounts.ready} orders ready for delivery`,
          description: "Consider scheduling a batch delivery to clear the backlog and improve client satisfaction.",
          confidence: "high",
          urgency: "soon",
        });
      }

      if (statusCounts.ordered > statusCounts["in-progress"] * 3 && statusCounts.ordered > 5) {
        localPredictions.push({
          type: "delay",
          title: "Pipeline bottleneck at Awaiting Stock",
          description: `${statusCounts.ordered} orders awaiting stock vs ${statusCounts["in-progress"]} in progress. Stock procurement may be the bottleneck.`,
          confidence: "medium",
          urgency: "soon",
        });
      }

      setPredictions(localPredictions);
      setLastUpdated(new Date());
    } catch (error) {
      console.error("Error fetching predictions:", error);
      toast({
        title: "Error",
        description: "Failed to generate predictions",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPredictions();
  }, []);

  const urgencyColors = {
    urgent: "bg-red-500/10 text-red-500 border-red-500/20",
    soon: "bg-amber-500/10 text-amber-500 border-amber-500/20",
    informational: "bg-sky-500/10 text-sky-500 border-sky-500/20",
  };

  const typeIcons = {
    reorder: <Package className="h-4 w-4" />,
    delay: <AlertTriangle className="h-4 w-4" />,
    trend: <TrendingUp className="h-4 w-4" />,
    opportunity: <Brain className="h-4 w-4" />,
  };

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Brain className="h-4 w-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold">Predictive Intelligence</CardTitle>
              <p className="text-xs text-muted-foreground">AI-powered insights from your data</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={fetchPredictions} disabled={loading} className="h-8 w-8">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading && predictions.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="ml-2 text-sm text-muted-foreground">Analyzing patterns...</span>
          </div>
        ) : predictions.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No actionable insights right now. Everything looks good! ✨</p>
        ) : (
          <div className="space-y-3">
            {predictions.map((pred, i) => (
              <div
                key={i}
                className="flex items-start gap-3 p-3 rounded-xl bg-secondary/30 hover:bg-secondary/50 transition-colors"
              >
                <div className={`mt-0.5 shrink-0 ${urgencyColors[pred.urgency].split(" ")[1]}`}>
                  {typeIcons[pred.type]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-medium text-foreground">{pred.title}</p>
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${urgencyColors[pred.urgency]}`}>
                      {pred.urgency}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{pred.description}</p>
                </div>
              </div>
            ))}
          </div>
        )}
        {lastUpdated && (
          <p className="text-[10px] text-muted-foreground mt-3 text-right">
            Updated {lastUpdated.toLocaleTimeString()}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
