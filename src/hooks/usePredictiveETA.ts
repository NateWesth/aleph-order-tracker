import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ETAStats {
  // median completion days keyed by `${companyId}|${urgency}`
  medianByCompanyUrgency: Map<string, number>;
  // global median by urgency
  medianByUrgency: Map<string, number>;
  // global median fallback
  globalMedian: number;
}

const median = (arr: number[]): number => {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

let cached: { stats: ETAStats; ts: number } | null = null;
const CACHE_MS = 10 * 60 * 1000; // 10 min

export function usePredictiveETA() {
  const [stats, setStats] = useState<ETAStats | null>(cached?.stats ?? null);
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    if (cached && Date.now() - cached.ts < CACHE_MS) {
      setStats(cached.stats);
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const since = new Date();
        since.setDate(since.getDate() - 180);
        const { data, error } = await supabase
          .from("orders")
          .select("company_id,urgency,created_at,completed_date")
          .not("completed_date", "is", null)
          .gte("created_at", since.toISOString())
          .limit(1000);
        if (error) throw error;

        const byCu: Record<string, number[]> = {};
        const byU: Record<string, number[]> = {};
        const all: number[] = [];

        for (const o of data ?? []) {
          if (!o.completed_date || !o.created_at) continue;
          const days =
            (new Date(o.completed_date).getTime() -
              new Date(o.created_at).getTime()) /
            86400000;
          if (days < 0 || days > 365) continue;
          const u = o.urgency || "normal";
          const k = `${o.company_id || "none"}|${u}`;
          (byCu[k] ||= []).push(days);
          (byU[u] ||= []).push(days);
          all.push(days);
        }

        const medianByCompanyUrgency = new Map<string, number>();
        Object.entries(byCu).forEach(([k, v]) => {
          if (v.length >= 3) medianByCompanyUrgency.set(k, median(v));
        });
        const medianByUrgency = new Map<string, number>();
        Object.entries(byU).forEach(([k, v]) => medianByUrgency.set(k, median(v)));

        const next: ETAStats = {
          medianByCompanyUrgency,
          medianByUrgency,
          globalMedian: median(all),
        };
        cached = { stats: next, ts: Date.now() };
        setStats(next);
      } catch (e) {
        console.error("usePredictiveETA error", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return { stats, loading };
}

export function predictETA(
  stats: ETAStats | null,
  companyId: string | null | undefined,
  urgency: string | null | undefined,
  createdAt: string,
): { etaDate: Date; daysRemaining: number; confidence: "high" | "medium" | "low" } | null {
  if (!stats) return null;
  const u = urgency || "normal";
  const key = `${companyId || "none"}|${u}`;
  let days = stats.medianByCompanyUrgency.get(key);
  let confidence: "high" | "medium" | "low" = "high";
  if (days == null) {
    days = stats.medianByUrgency.get(u);
    confidence = "medium";
  }
  if (days == null) {
    days = stats.globalMedian;
    confidence = "low";
  }
  if (!days || days <= 0) return null;
  const etaDate = new Date(new Date(createdAt).getTime() + days * 86400000);
  const daysRemaining = Math.ceil((etaDate.getTime() - Date.now()) / 86400000);
  return { etaDate, daysRemaining, confidence };
}
