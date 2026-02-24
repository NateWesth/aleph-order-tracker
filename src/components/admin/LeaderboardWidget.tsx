import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy, Medal, Flame, Crown } from "lucide-react";
import { cn } from "@/lib/utils";

interface LeaderEntry {
  userId: string;
  userName: string;
  count: number;
}

export default function LeaderboardWidget() {
  const [leaders, setLeaders] = useState<LeaderEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [todayStreak, setTodayStreak] = useState(0);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        // Get deliveries from this week
        const now = new Date();
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startOfWeek.setHours(0, 0, 0, 0);

        // Fetch activity logs for status_change to delivered this week
        const { data: logs } = await supabase
          .from("order_activity_log")
          .select("user_id, created_at")
          .eq("activity_type", "status_change")
          .gte("created_at", startOfWeek.toISOString())
          .not("user_id", "is", null);

        if (!logs || logs.length === 0) {
          setLoading(false);
          return;
        }

        // Filter for delivered status changes (metadata check via title)
        // Count per user
        const countMap = new Map<string, number>();
        logs.forEach(log => {
          if (log.user_id) {
            countMap.set(log.user_id, (countMap.get(log.user_id) || 0) + 1);
          }
        });

        // Fetch user names
        const userIds = Array.from(countMap.keys());
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", userIds);

        const nameMap = new Map(profiles?.map(p => [p.id, p.full_name || "Unknown"]) || []);

        const leaderboard: LeaderEntry[] = Array.from(countMap.entries())
          .map(([userId, count]) => ({
            userId,
            userName: nameMap.get(userId) || "Unknown",
            count,
          }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5);

        setLeaders(leaderboard);

        // Get today's streak from sessionStorage
        const stored = sessionStorage.getItem("completion_streak");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed.date === new Date().toDateString()) {
            setTodayStreak(parsed.count);
          }
        }
      } catch (error) {
        console.error("Error fetching leaderboard:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchLeaderboard();
  }, []);

  const getRankIcon = (index: number) => {
    switch (index) {
      case 0: return <Crown className="h-4 w-4 text-amber-500" />;
      case 1: return <Medal className="h-4 w-4 text-slate-400" />;
      case 2: return <Medal className="h-4 w-4 text-amber-700" />;
      default: return <span className="text-xs font-bold text-muted-foreground w-4 text-center">{index + 1}</span>;
    }
  };

  const getRankBg = (index: number) => {
    switch (index) {
      case 0: return "bg-amber-500/10 border-amber-500/20";
      case 1: return "bg-slate-500/5 border-slate-500/10";
      case 2: return "bg-amber-700/5 border-amber-700/10";
      default: return "bg-muted/30 border-border/50";
    }
  };

  if (loading) {
    return (
      <Card className="glass-card glow-border border-border/50">
        <CardContent className="p-6">
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-12 rounded-xl bg-muted/50 animate-pulse" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-card glow-border border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Trophy className="h-4 w-4 text-amber-500" />
          Weekly Leaderboard
          {todayStreak > 0 && (
            <span className="ml-auto flex items-center gap-1 text-xs text-primary font-semibold">
              <Flame className="h-3.5 w-3.5 text-orange-500" />
              {todayStreak} today
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {leaders.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No activity this week yet. Start completing orders! 🚀
          </p>
        ) : (
          <div className="space-y-2">
            {leaders.map((leader, i) => (
              <div
                key={leader.userId}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-xl border transition-all",
                  getRankBg(i),
                  i === 0 && "shadow-sm"
                )}
              >
                <div className="shrink-0">{getRankIcon(i)}</div>
                <div className="flex-1 min-w-0">
                  <p className={cn(
                    "text-sm font-medium text-foreground truncate",
                    i === 0 && "font-bold"
                  )}>
                    {leader.userName}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className={cn(
                    "text-lg font-bold",
                    i === 0 ? "text-amber-500" : "text-foreground"
                  )}>
                    {leader.count}
                  </span>
                  <span className="text-[10px] text-muted-foreground">actions</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
