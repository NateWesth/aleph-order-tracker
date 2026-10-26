import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { Button } from "@/components/ui/button";
import { showLocalNotification } from "@/lib/pushNotifications";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { disablePush, enablePush, getPushStatus, type PushStatus } from "@/lib/pushNotifications";

const HINT: Record<PushStatus, string> = {
  enabled: "On for this device.",
  disabled: "Off for this device.",
  denied: "Blocked — allow notifications for this site in your browser or phone settings.",
  unsupported: "This browser can't show notifications. On iPhone, add the app to your Home Screen first.",
  "open-in-new-tab": "Open the app in its own tab to turn this on.",
  "update-required": "Install the latest Android app to enable notifications; this version does not include notification support.",
};

export default function PushNotificationToggle() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [status, setStatus] = useState<PushStatus>("disabled");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const refresh = () => { void getPushStatus().then(setStatus).catch(() => setStatus("update-required")); };
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("aleph:notification-settings", refresh);
    return () => { window.removeEventListener("focus", refresh); window.removeEventListener("aleph:notification-settings", refresh); };
  }, []);

  const toggle = async (on: boolean) => {
    if (!user) return;
    setBusy(true);
    try {
      const next = on ? await enablePush(user.id) : await disablePush();
      setStatus(next);
      if (next !== "enabled" && on) toast({ title: "Notifications not enabled", description: HINT[next], variant: "destructive" });
    }
    catch (e) { toast({ title: "Couldn't change notifications", description: String((e as Error).message ?? e), variant: "destructive" }); }
    finally { setBusy(false); }
  };

  return (
    <div className="flex items-center justify-between gap-3 py-3 border-b border-border">
      <div className="flex min-w-0 items-center gap-3">
        <BellRing className="h-4 w-4 text-logo-cyan" />
        <div>
          <Label className="text-sm font-medium">Comment notifications on this device</Label>
          <p className="text-xs text-muted-foreground">Pop-up alerts with who commented or replied and what they said. {HINT[status]}</p>
          {Capacitor.isNativePlatform() && <p className="text-xs text-muted-foreground">Alerts currently work while the app is open. Closed-app alerts require Firebase setup and a new Android version.</p>}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <Switch aria-label="Comment notifications on this device" checked={status === "enabled"} disabled={busy || status === "unsupported" || status === "open-in-new-tab" || status === "update-required"} onCheckedChange={toggle} />
        {status === "enabled" && <Button variant="outline" size="sm" disabled={busy} onClick={async () => {
          try { await showLocalNotification({ id: crypto.randomUUID(), title: "Aleph notification test", message: "Comment and reply alerts are enabled on this device.", order_id: null }); }
          catch (error) { toast({ title: "Test failed", description: String(error), variant: "destructive" }); }
        }}>Test alert</Button>}
      </div>
    </div>
  );
}
