import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";
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
};

export default function PushNotificationToggle() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [status, setStatus] = useState<PushStatus>("disabled");
  const [busy, setBusy] = useState(false);

  useEffect(() => { void getPushStatus().then(setStatus).catch(() => setStatus("unsupported")); }, []);

  const toggle = async (on: boolean) => {
    if (!user) return;
    setBusy(true);
    try { setStatus(on ? await enablePush(user.id) : await disablePush()); }
    catch (e) { toast({ title: "Couldn't change notifications", description: String((e as Error).message ?? e), variant: "destructive" }); }
    finally { setBusy(false); }
  };

  return (
    <div className="flex items-center justify-between py-3 border-b border-border">
      <div className="flex items-center gap-3">
        <BellRing className="h-4 w-4 text-logo-cyan" />
        <div>
          <Label className="text-sm font-medium">Comment notifications on this device</Label>
          <p className="text-xs text-muted-foreground">Pop-up alerts with who commented or replied and what they said. {HINT[status]}</p>
        </div>
      </div>
      <Switch checked={status === "enabled"} disabled={busy || status === "unsupported" || status === "open-in-new-tab"} onCheckedChange={toggle} />
    </div>
  );
}
