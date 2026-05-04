import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, RefreshCw, Loader2, TrendingUp, TrendingDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

interface Summary {
  thisWeek: { ordersCreated: number; ordersCompleted: number; revenueCreated: number; revenueCompleted: number };
  lastWeek: { ordersCreated: number; ordersCompleted: number; revenueCreated: number; revenueCompleted: number };
  pipeline: { active: number; urgent: number; agingOver14d: number };
  topClients: { name: string; count: number; value: number }[];
  activityCount: number;
}

const CACHE_KEY = "weekly-digest-cache";
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6h

export default function WeeklyDigestWidget() {
  const [digest, setDigest] = useState<string>("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const cached = JSON.parse(raw);
        if (Date.now() - cached.ts < CACHE_TTL) {
          setDigest(cached.digest);
          setSummary(cached.summary);
          setGeneratedAt(new Date(cached.generatedAt));
          return;
        }
      }
    } catch {}
    fetchDigest();
  }, []);

  const fetchDigest = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("weekly-digest");
      if (error) throw error;
      setDigest(data.digest);
      setSummary(data.summary);
      setGeneratedAt(new Date(data.generatedAt));
      localStorage.setItem(CACHE_KEY, JSON.stringify({ ...data, ts: Date.now() }));
    } catch (err: any) {
      toast({ title: "Couldn't generate digest", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const formatZAR = (n: number) => new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(n);

  const orderDelta = summary ? summary.thisWeek.ordersCreated - summary.lastWeek.ordersCreated : 0;
  const revenueDelta = summary ? summary.thisWeek.revenueCreated - summary.lastWeek.revenueCreated : 0;

  return (
    <Card className="glass-card glow-border border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            AI Weekly Digest
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={fetchDigest} disabled={loading} className="h-7 px-2 rounded-lg">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {summary && (
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-secondary/40 border border-border/40">
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-muted-foreground">Orders this week</p>
                {orderDelta !== 0 && (
                  orderDelta > 0
                    ? <TrendingUp className="h-3 w-3 text-emerald-500" />
                    : <TrendingDown className="h-3 w-3 text-destructive" />
                )}
              </div>
              <p className="text-xl font-bold text-foreground mt-1">{summary.thisWeek.ordersCreated}</p>
              <p className="text-[11px] text-muted-foreground">
                {orderDelta >= 0 ? "+" : ""}{orderDelta} vs last week
              </p>
            </div>
            <div className="p-3 rounded-xl bg-secondary/40 border border-border/40">
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-muted-foreground">Revenue created</p>
                {revenueDelta !== 0 && (
                  revenueDelta > 0
                    ? <TrendingUp className="h-3 w-3 text-emerald-500" />
                    : <TrendingDown className="h-3 w-3 text-destructive" />
                )}
              </div>
              <p className="text-xl font-bold text-foreground mt-1">{formatZAR(summary.thisWeek.revenueCreated)}</p>
              <p className="text-[11px] text-muted-foreground">
                vs {formatZAR(summary.lastWeek.revenueCreated)}
              </p>
            </div>
          </div>
        )}

        {loading && !digest ? (
          <div className="space-y-2">
            <div className="shimmer h-3 w-full" />
            <div className="shimmer h-3 w-11/12" />
            <div className="shimmer h-3 w-4/5" />
            <div className="shimmer h-3 w-3/4" />
          </div>
        ) : digest ? (
          <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">{digest}</p>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">No digest yet.</p>
        )}

        {generatedAt && (
          <p className="text-[11px] text-muted-foreground text-right">
            Updated {formatDistanceToNow(generatedAt, { addSuffix: true })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
