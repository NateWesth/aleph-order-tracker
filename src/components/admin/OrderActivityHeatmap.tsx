import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageSkeleton } from "@/components/ui/PageSkeleton";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

interface HeatmapCell {
  day: number;
  hour: number;
  count: number;
}

export default function OrderActivityHeatmap() {
  const [data, setData] = useState<HeatmapCell[]>([]);
  const [loading, setLoading] = useState(true);
  const [maxCount, setMaxCount] = useState(1);

  useEffect(() => {
    fetchHeatmapData();
  }, []);

  const fetchHeatmapData = async () => {
    try {
      // Fetch orders from last 90 days
      const since = new Date();
      since.setDate(since.getDate() - 90);

      const { data: orders } = await supabase
        .from("orders")
        .select("created_at")
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: false });

      // Build heatmap grid
      const grid = new Map<string, number>();
      for (let d = 0; d < 7; d++) {
        for (let h = 0; h < 24; h++) {
          grid.set(`${d}-${h}`, 0);
        }
      }

      let max = 0;
      (orders || []).forEach(o => {
        if (!o.created_at) return;
        const date = new Date(o.created_at);
        const day = date.getDay();
        const hour = date.getHours();
        const key = `${day}-${hour}`;
        const val = (grid.get(key) || 0) + 1;
        grid.set(key, val);
        if (val > max) max = val;
      });

      const cells: HeatmapCell[] = [];
      grid.forEach((count, key) => {
        const [d, h] = key.split("-").map(Number);
        cells.push({ day: d, hour: h, count });
      });

      setData(cells);
      setMaxCount(max || 1);
    } catch (error) {
      console.error("Error fetching heatmap data:", error);
    } finally {
      setLoading(false);
    }
  };

  const getColor = (count: number) => {
    if (count === 0) return "bg-muted/30";
    const intensity = count / maxCount;
    if (intensity < 0.25) return "bg-primary/20";
    if (intensity < 0.5) return "bg-primary/40";
    if (intensity < 0.75) return "bg-primary/60";
    return "bg-primary/90";
  };

  const peakHour = useMemo(() => {
    if (data.length === 0) return null;
    const hourTotals = new Map<number, number>();
    data.forEach(c => {
      hourTotals.set(c.hour, (hourTotals.get(c.hour) || 0) + c.count);
    });
    let peak = 0;
    let peakH = 0;
    hourTotals.forEach((total, h) => {
      if (total > peak) {
        peak = total;
        peakH = h;
      }
    });
    return { hour: peakH, count: peak };
  }, [data]);

  const peakDay = useMemo(() => {
    if (data.length === 0) return null;
    const dayTotals = new Map<number, number>();
    data.forEach(c => {
      dayTotals.set(c.day, (dayTotals.get(c.day) || 0) + c.count);
    });
    let peak = 0;
    let peakD = 0;
    dayTotals.forEach((total, d) => {
      if (total > peak) {
        peak = total;
        peakD = d;
      }
    });
    return { day: DAYS[peakD], count: peak };
  }, [data]);

  // Show condensed hour labels
  const displayHours = [0, 3, 6, 9, 12, 15, 18, 21];

  if (loading) {
    return <PageSkeleton variant="heatmap" />;
  }

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Flame className="h-4 w-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold">Order Activity Heatmap</CardTitle>
              <p className="text-xs text-muted-foreground">Last 90 days — when orders come in</p>
            </div>
          </div>
          {peakDay && peakHour && (
            <div className="text-right hidden sm:block">
              <p className="text-xs text-muted-foreground">
                Peak: <span className="font-semibold text-foreground">{peakDay.day}s</span> at{" "}
                <span className="font-semibold text-foreground">
                  {peakHour.hour.toString().padStart(2, "0")}:00
                </span>
              </p>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <div className="min-w-[400px]">
            {/* Hour labels */}
            <div className="flex items-center mb-1 pl-10">
              {HOURS.map(h => (
                <div key={h} className="flex-1 text-center">
                  {displayHours.includes(h) && (
                    <span className="text-[9px] text-muted-foreground">
                      {h.toString().padStart(2, "0")}
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Grid */}
            {DAYS.map((dayLabel, dayIdx) => (
              <div key={dayLabel} className="flex items-center gap-1 mb-0.5">
                <span className="text-[10px] text-muted-foreground w-8 text-right shrink-0">
                  {dayLabel}
                </span>
                <div className="flex-1 flex gap-0.5">
                  {HOURS.map(h => {
                    const cell = data.find(c => c.day === dayIdx && c.hour === h);
                    const count = cell?.count || 0;
                    return (
                      <div
                        key={h}
                        className={cn(
                          "flex-1 aspect-square rounded-sm transition-colors cursor-default",
                          getColor(count)
                        )}
                        title={`${dayLabel} ${h.toString().padStart(2, "0")}:00 — ${count} order${count !== 1 ? "s" : ""}`}
                      />
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Legend */}
            <div className="flex items-center justify-between mt-3 px-10">
              <span className="text-[10px] text-muted-foreground">Less</span>
              <div className="flex gap-1">
                <div className="w-3 h-3 rounded-sm bg-muted/30" />
                <div className="w-3 h-3 rounded-sm bg-primary/20" />
                <div className="w-3 h-3 rounded-sm bg-primary/40" />
                <div className="w-3 h-3 rounded-sm bg-primary/60" />
                <div className="w-3 h-3 rounded-sm bg-primary/90" />
              </div>
              <span className="text-[10px] text-muted-foreground">More</span>
            </div>
          </div>
        </div>

        {/* Mobile peak info */}
        {peakDay && peakHour && (
          <div className="mt-3 sm:hidden text-center">
            <p className="text-xs text-muted-foreground">
              Busiest: <span className="font-semibold text-foreground">{peakDay.day}s at {peakHour.hour.toString().padStart(2, "0")}:00</span>
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
