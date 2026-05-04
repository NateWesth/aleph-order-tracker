import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus, Loader2 } from "lucide-react";
import { format, subMonths, startOfMonth } from "date-fns";
import { cn } from "@/lib/utils";

interface RepForecast {
  rep_id: string;
  rep_name: string;
  current: number;
  previous: number;
  forecast: number;
  trend: number[]; // last 6 months commission
  delta: number; // % vs previous month at same point
}

const MAX_BARS = 6;

export default function CommissionForecastWidget() {
  const [loading, setLoading] = useState(true);
  const [reps, setReps] = useState<RepForecast[]>([]);
  const [totalForecast, setTotalForecast] = useState(0);

  useEffect(() => {
    void load();
  }, []);

  const load = async () => {
    try {
      // Pull the last 6 months of cached commission reports
      const months: string[] = [];
      for (let i = 0; i < MAX_BARS; i++) {
        months.push(format(startOfMonth(subMonths(new Date(), i)), "yyyy-MM-dd"));
      }
      const { data, error } = await supabase
        .from("commission_report_cache")
        .select("period_month, report")
        .is("rep_id", null)
        .in("period_month", months);

      if (error) throw error;

      // Build per-rep history
      const byRep = new Map<string, RepForecast>();
      const monthIdx = new Map(months.map((m, i) => [m, MAX_BARS - 1 - i])); // oldest -> 0

      for (const row of data || []) {
        const period = row.period_month as string;
        const idx = monthIdx.get(period);
        if (idx === undefined) continue;
        const repList = (row.report as any)?.data || [];
        for (const r of repList) {
          if (!byRep.has(r.rep_id)) {
            byRep.set(r.rep_id, {
              rep_id: r.rep_id,
              rep_name: r.rep_name,
              current: 0,
              previous: 0,
              forecast: 0,
              trend: new Array(MAX_BARS).fill(0),
              delta: 0,
            });
          }
          byRep.get(r.rep_id)!.trend[idx] = Number(r.commission_earned || 0);
        }
      }

      // Forecast = current month so far × (days_in_month / day_of_month)
      const now = new Date();
      const dayOfMonth = now.getDate();
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const projection = daysInMonth / Math.max(dayOfMonth, 1);

      const list: RepForecast[] = [];
      for (const rep of byRep.values()) {
        rep.current = rep.trend[MAX_BARS - 1];
        rep.previous = rep.trend[MAX_BARS - 2];
        rep.forecast = rep.current * projection;
        rep.delta = rep.previous > 0 ? ((rep.forecast - rep.previous) / rep.previous) * 100 : 0;
        list.push(rep);
      }

      list.sort((a, b) => b.forecast - a.forecast);
      setReps(list);
      setTotalForecast(list.reduce((s, r) => s + r.forecast, 0));
    } catch (e) {
      console.error("Forecast load error", e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="glass-card glow-border border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
          <span className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-500" />
            Commission Forecast — {format(new Date(), "MMM yyyy")}
          </span>
          {!loading && (
            <span className="text-xs font-bold text-foreground">
              R{totalForecast.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : reps.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No commission data yet. Refresh a month in the Commission page.
          </p>
        ) : (
          <div className="space-y-3">
            {reps.slice(0, 6).map(rep => {
              const max = Math.max(...rep.trend, rep.forecast, 1);
              const trendIcon =
                rep.delta > 5 ? <TrendingUp className="h-3 w-3 text-emerald-500" /> :
                rep.delta < -5 ? <TrendingDown className="h-3 w-3 text-destructive" /> :
                <Minus className="h-3 w-3 text-muted-foreground" />;
              return (
                <div key={rep.rep_id} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-foreground truncate">{rep.rep_name}</span>
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      {trendIcon}
                      <span className={cn(
                        "font-semibold tabular-nums",
                        rep.delta > 5 && "text-emerald-500",
                        rep.delta < -5 && "text-destructive",
                      )}>
                        R{rep.forecast.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </span>
                      {rep.previous > 0 && (
                        <span className="text-[10px] text-muted-foreground">
                          ({rep.delta >= 0 ? "+" : ""}{rep.delta.toFixed(0)}%)
                        </span>
                      )}
                    </span>
                  </div>
                  {/* Sparkline */}
                  <div className="flex items-end gap-0.5 h-6">
                    {rep.trend.map((v, i) => (
                      <div
                        key={i}
                        className={cn(
                          "flex-1 rounded-t transition-all",
                          i === MAX_BARS - 1 ? "bg-primary/60" : "bg-muted-foreground/30"
                        )}
                        style={{ height: `${Math.max(2, (v / max) * 100)}%` }}
                        title={`R${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                      />
                    ))}
                    {/* Forecast bar */}
                    <div
                      className="flex-1 rounded-t bg-emerald-500/70 border-l border-emerald-300/40"
                      style={{ height: `${Math.max(2, (rep.forecast / max) * 100)}%` }}
                      title={`Forecast R${rep.forecast.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-3 text-[10px] text-muted-foreground text-center">
          Forecast = current MTD × (days in month ÷ today)
        </p>
      </CardContent>
    </Card>
  );
}
