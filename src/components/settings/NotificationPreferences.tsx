import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Bell, Mail, MessageSquare, Package, AlertTriangle, CheckCircle2, Sun, Sunset } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

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
  const [morningReport, setMorningReport] = useState(false);
  const [afternoonReport, setAfternoonReport] = useState(false);
  const [loadingReports, setLoadingReports] = useState(true);
  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    try {
      const saved = localStorage.getItem(PREFS_KEY);
      if (saved) setPrefs({ ...DEFAULT_PREFS, ...JSON.parse(saved) });
    } catch { /* defaults */ }
  }, []);

  // Load daily report preferences from DB
  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('daily_morning_report, daily_afternoon_report')
        .eq('id', user.id)
        .single();
      if (data) {
        setMorningReport(data.daily_morning_report ?? false);
        setAfternoonReport(data.daily_afternoon_report ?? false);
      }
      setLoadingReports(false);
    })();
  }, [user?.id]);

  const update = (key: keyof NotificationPref, value: boolean) => {
    const updated = { ...prefs, [key]: value };
    setPrefs(updated);
    localStorage.setItem(PREFS_KEY, JSON.stringify(updated));
    toast({
      title: "Preferences Updated",
      description: "Your notification settings have been saved.",
    });
  };

  const updateDailyReport = async (field: 'daily_morning_report' | 'daily_afternoon_report', value: boolean) => {
    if (!user?.id) return;
    const setter = field === 'daily_morning_report' ? setMorningReport : setAfternoonReport;
    setter(value);
    const { error } = await supabase
      .from('profiles')
      .update({ [field]: value })
      .eq('id', user.id);
    if (error) {
      setter(!value);
      toast({ title: "Error", description: "Failed to update report preference.", variant: "destructive" });
    } else {
      toast({ title: "Preferences Updated", description: value ? "You'll receive this daily report." : "Daily report disabled." });
    }
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
    <div className="space-y-4">
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

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center space-x-2">
            <Mail className="h-5 w-5 text-primary" />
            <CardTitle className="text-base sm:text-lg">Daily Email Reports</CardTitle>
          </div>
          <CardDescription className="text-xs sm:text-sm">
            Receive automated daily email reports with PDF attachments
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          <div className="flex items-center justify-between py-3 border-b border-border">
            <div className="flex items-center gap-3">
              <Sun className="h-4 w-4 text-amber-500" />
              <div>
                <Label className="text-sm font-medium">Morning Progress Report (7:00 AM)</Label>
                <p className="text-xs text-muted-foreground">
                  Orders awaiting stock, in-stock status, delivery readiness, and full progress overview
                </p>
              </div>
            </div>
            <Switch
              disabled={loadingReports}
              checked={morningReport}
              onCheckedChange={(checked) => updateDailyReport('daily_morning_report', checked)}
            />
          </div>
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              <Sunset className="h-4 w-4 text-purple-500" />
              <div>
                <Label className="text-sm font-medium">Afternoon Summary Report (3:00 PM)</Label>
                <p className="text-xs text-muted-foreground">
                  Completed orders, awaiting delivery, urgent items, and daily revenue summary
                </p>
              </div>
            </div>
            <Switch
              disabled={loadingReports}
              checked={afternoonReport}
              onCheckedChange={(checked) => updateDailyReport('daily_afternoon_report', checked)}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
