import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface PresenceUser {
  userId: string;
  name: string;
  initials: string;
  activeView?: string;
  lastSeen: string;
}

interface OnlinePresenceIndicatorProps {
  currentView?: string;
}

export default function OnlinePresenceIndicator({ currentView }: OnlinePresenceIndicatorProps) {
  const { user } = useAuth();
  const [onlineUsers, setOnlineUsers] = useState<PresenceUser[]>([]);

  useEffect(() => {
    if (!user) return;

    const channel = supabase.channel("online-users", {
      config: { presence: { key: user.id } },
    });

    // Fetch user's name for presence
    const fetchAndTrack = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();

      const name = data?.full_name || user.email?.split("@")[0] || "User";
      const initials = name
        .split(" ")
        .map((n: string) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);

      channel
        .on("presence", { event: "sync" }, () => {
          const state = channel.presenceState();
          const users: PresenceUser[] = [];
          
          Object.entries(state).forEach(([userId, presences]) => {
            if (userId === user.id) return;
            const latest = (presences as any[])[0];
            users.push({
              userId,
              name: latest.name || "User",
              initials: latest.initials || "U",
              activeView: latest.activeView,
              lastSeen: latest.online_at || new Date().toISOString(),
            });
          });
          
          setOnlineUsers(users);
        })
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED") {
            await channel.track({
              name,
              initials,
              activeView: currentView,
              online_at: new Date().toISOString(),
            });
          }
        });
    };

    fetchAndTrack();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Update presence when view changes
  useEffect(() => {
    if (!user) return;
    const channel = supabase.channel("online-users");
    // Re-track with updated view
    const updatePresence = async () => {
      try {
        const { data } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", user.id)
          .maybeSingle();
        const name = data?.full_name || user.email?.split("@")[0] || "User";
        const initials = name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);
        await channel.track({
          name,
          initials,
          activeView: currentView,
          online_at: new Date().toISOString(),
        });
      } catch {
        // Channel may not be ready yet
      }
    };
    updatePresence();
  }, [currentView, user]);

  if (onlineUsers.length === 0) return null;

  const COLORS = [
    "bg-emerald-500",
    "bg-sky-500",
    "bg-violet-500",
    "bg-amber-500",
    "bg-rose-500",
  ];

  return (
    <TooltipProvider>
      <div className="flex items-center gap-1">
        <div className="flex -space-x-2">
          {onlineUsers.slice(0, 4).map((u, i) => (
            <Tooltip key={u.userId}>
              <TooltipTrigger asChild>
                <div className="relative">
                  <Avatar className={cn("h-7 w-7 border-2 border-card ring-0", COLORS[i % COLORS.length])}>
                    <AvatarFallback className="text-[10px] font-bold text-white bg-transparent">
                      {u.initials}
                    </AvatarFallback>
                  </Avatar>
                  <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-card" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                <p className="font-medium">{u.name}</p>
                {u.activeView && (
                  <p className="text-muted-foreground">Viewing: {u.activeView}</p>
                )}
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
        {onlineUsers.length > 4 && (
          <span className="text-[11px] text-muted-foreground ml-1">
            +{onlineUsers.length - 4}
          </span>
        )}
        <span className="text-[11px] text-muted-foreground ml-1 hidden sm:inline">online</span>
      </div>
    </TooltipProvider>
  );
}
