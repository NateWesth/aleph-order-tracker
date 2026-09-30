import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { BellRing, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { enablePush, getPushStatus, PUSH_TYPES, showLocalNotification, type PushStatus } from "@/lib/pushNotifications";

const DISMISS_KEY = "aleph:push-prompt-dismissed";

function openOrder(orderId: string) {
  window.sessionStorage.setItem("aleph:open-order", orderId);
  window.setTimeout(() => window.dispatchEvent(new CustomEvent("aleph:open-order", { detail: orderId })), 300);
}

/** Shows system notifications for new comment alerts and offers a one-time enable prompt. */
export default function PushNotificationsBridge() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === "1");

  useEffect(() => { void getPushStatus().then(setStatus).catch(() => setStatus("unsupported")); }, []);

  // Open the order a tapped notification points at.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const order = params.get("order");
    if (order) {
      openOrder(order);
      params.delete("order");
      const qs = params.toString();
      window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));
    }
    if (!Capacitor.isNativePlatform()) return;
    let handle: { remove: () => void } | undefined;
    void import("@capacitor/local-notifications").then(async ({ LocalNotifications }) => {
      handle = await LocalNotifications.addListener("localNotificationActionPerformed", (a) => {
        const id = a.notification.extra?.order_id;
        if (id) openOrder(id);
      });
    });
    return () => handle?.remove();
  }, []);

  // Refresh this device's subscription on sign-in.
  useEffect(() => {
    if (user?.id && status === "enabled" && !Capacitor.isNativePlatform()) void enablePush(user.id).catch(() => {});
  }, [user?.id, status]);

  // Live alerts while the app is open.
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`push-bridge-${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const n = payload.new as { id: string; type: string; title: string; message: string; order_id: string | null };
          if (!PUSH_TYPES.has(n.type)) return;
          void showLocalNotification(n).catch(() => {});
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  if (!user || dismissed || status !== "disabled") return null;

  const turnOn = async () => {
    try {
      const s = await enablePush(user.id);
      setStatus(s);
      if (s === "enabled") toast({ title: "Notifications on", description: "You'll get comment and reply alerts on this device." });
      else if (s === "denied") toast({ title: "Notifications blocked", description: "Allow notifications for this site in your browser settings.", variant: "destructive" });
    } catch (e) {
      toast({ title: "Couldn't turn on notifications", description: String((e as Error).message ?? e), variant: "destructive" });
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-[60] flex max-w-sm items-center gap-3 rounded-2xl border border-logo-cyan/30 bg-card/95 p-3 shadow-lg backdrop-blur">
      <BellRing className="h-5 w-5 shrink-0 text-logo-cyan" />
      <p className="text-xs text-foreground">Get a notification when someone comments, replies or mentions you.</p>
      <Button size="sm" onClick={turnOn}>Turn on</Button>
      <button aria-label="Dismiss" className="text-muted-foreground hover:text-foreground"
        onClick={() => { localStorage.setItem(DISMISS_KEY, "1"); setDismissed(true); }}>
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
