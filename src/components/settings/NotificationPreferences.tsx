import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Bell, Mail, MessageSquare, Package, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const PREFS_KEY = "notification-preferences";

interface NotificationPref {
  orderCreated: boolean;
  orderStatusChanged: boolean;
  orderCompleted: boolean;
  newMessage: boolean;
  urgentAlerts: boolean;
  emailNotifications: boolean;
}

const DEFAULT_PREFS: NotificationPref = {
  orderCreated: true,
  orderStatusChanged: true,
  orderCompleted: true,
  newMessage: true,
  urgentAlerts: true,
  emailNotifications: false,
};

export default function NotificationPreferences() {
  const [prefs, setPrefs] = useState<NotificationPref>(DEFAULT_PREFS);
  const { toast } = useToast();

  useEffect(() => {
    try {
      const saved = localStorage.getItem(PREFS_KEY);
      if (saved) setPrefs({ ...DEFAULT_PREFS, ...JSON.parse(saved) });
    } catch { /* defaults */ }
  }, []);

  const update = (key: keyof NotificationPref, value: boolean) => {
    const updated = { ...prefs, [key]: value };
    setPrefs(updated);
    localStorage.setItem(PREFS_KEY, JSON.stringify(updated));
    toast({
      title: "Preferences Updated",
      description: "Your notification settings have been saved.",
    });
  };

  const items: { key: keyof NotificationPref; label: string; desc: string; icon: React.ReactNode }[] = [
    { key: "orderCreated", label: "New Orders", desc: "When a new order is created", icon: <Package className="h-4 w-4 text-primary" /> },
    { key: "orderStatusChanged", label: "Status Changes", desc: "When an order status changes", icon: <AlertTriangle className="h-4 w-4 text-amber-500" /> },
    { key: "orderCompleted", label: "Order Completed", desc: "When an order is marked as delivered", icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" /> },
    { key: "newMessage", label: "New Messages", desc: "When someone posts an update on an order", icon: <MessageSquare className="h-4 w-4 text-sky-500" /> },
    { key: "urgentAlerts", label: "Urgent Alerts", desc: "High priority and urgent order notifications", icon: <AlertTriangle className="h-4 w-4 text-destructive" /> },
    { key: "emailNotifications", label: "Email Notifications", desc: "Receive email alerts for important events", icon: <Mail className="h-4 w-4 text-violet-500" /> },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center space-x-2">
          <Bell className="h-5 w-5 text-primary" />
          <CardTitle className="text-base sm:text-lg">Notification Preferences</CardTitle>
        </div>
        <CardDescription className="text-xs sm:text-sm">
          Choose which notifications you want to receive
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        {items.map(item => (
          <div key={item.key} className="flex items-center justify-between py-3 border-b border-border last:border-0">
            <div className="flex items-center gap-3">
              {item.icon}
              <div>
                <Label className="text-sm font-medium">{item.label}</Label>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
            </div>
            <Switch
              checked={prefs[item.key]}
              onCheckedChange={(checked) => update(item.key, checked)}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
