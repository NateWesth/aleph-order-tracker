import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, Check, ExternalLink, BookOpen, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function ZohoIntegrationSettings() {
  const { toast } = useToast();
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [connectionInfo, setConnectionInfo] = useState<any>(null);
  const [syncLog, setSyncLog] = useState<any[]>([]);

  useEffect(() => {
    checkConnection();
    fetchSyncLog();
  }, []);

  const getAuthHeaders = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    return {
      'Authorization': `Bearer ${token}`,
      'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    };
  };

  const checkConnection = async () => {
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const headers = await getAuthHeaders();
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/zoho-auth?action=status`,
        { headers }
      );
      const result = await response.json();
      setConnected(result.connected);
      setConnectionInfo(result);
    } catch (error) {
      console.error("Failed to check Zoho connection:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSyncLog = async () => {
    const { data } = await supabase
      .from("zoho_sync_log")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(5);
    setSyncLog(data || []);
  };


  const handleConnect = async () => {
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const headers = await getAuthHeaders();
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/zoho-auth?action=authorize`,
        { headers }
      );
      const data = await response.json();
      if (data.auth_url) {
        window.open(data.auth_url, "_blank", "width=600,height=700");
        const interval = setInterval(async () => {
          const hdrs = await getAuthHeaders();
          const statusRes = await fetch(
            `https://${projectId}.supabase.co/functions/v1/zoho-auth?action=status`,
            { headers: hdrs }
          );
          const statusData = await statusRes.json();
          if (statusData.connected) {
            clearInterval(interval);
            setConnected(true);
            setConnectionInfo(statusData);
            toast({ title: "Connected!", description: "Zoho Books connected successfully." });
          }
        }, 3000);
        setTimeout(() => clearInterval(interval), 5 * 60 * 1000);
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to initiate Zoho connection.", variant: "destructive" });
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const headers = await getAuthHeaders();
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/zoho-sync`,
        {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ sync_type: "full" }),
        }
      );
      const data = await response.json();
      if (data.success) {
        toast({ title: "Sync Complete", description: `Synced ${data.total_synced} records from Zoho Books.` });
        fetchSyncLog();
      } else {
        throw new Error(data.error || "Sync failed");
      }
    } catch (error: any) {
      toast({ title: "Sync Failed", description: error.message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <BookOpen className="h-5 w-5 text-primary" />
            <CardTitle className="text-base sm:text-lg">Zoho Books</CardTitle>
          </div>
          <Badge variant={connected ? "default" : "secondary"}>
            {connected ? (
              <><Check className="h-3 w-3 mr-1" /> Connected</>
            ) : (
              "Not Connected"
            )}
          </Badge>
        </div>
        <CardDescription className="text-xs sm:text-sm">
          Sync items, contacts, and purchase orders from Zoho Books
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!connected ? (
          <Button onClick={handleConnect} className="w-full sm:w-auto">
            <ExternalLink className="h-4 w-4 mr-2" />
            Connect Zoho Books
          </Button>
        ) : (
          <>
            {/* Connection info */}
            {connectionInfo?.organization_id && (
              <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-lg space-y-1">
                <p><span className="font-medium">Organization ID:</span> {connectionInfo.organization_id}</p>
                {connectionInfo.last_updated && (
                  <p><span className="font-medium">Token updated:</span> {formatDistanceToNow(new Date(connectionInfo.last_updated), { addSuffix: true })}</p>
                )}
              </div>
            )}

            {/* Manual sync button */}
            <Button onClick={handleSync} disabled={syncing} variant="outline" className="w-full sm:w-auto">
              {syncing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              {syncing ? "Syncing..." : "Sync Now"}
            </Button>

            {/* Sync history */}
            {syncLog.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Recent Syncs</p>
                <div className="space-y-1.5">
                  {syncLog.map((log) => (
                    <div key={log.id} className="flex items-center justify-between text-xs p-2 rounded-md bg-secondary/30">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={log.status === "completed" ? "default" : log.status === "failed" ? "destructive" : "secondary"}
                          className="text-[10px] px-1.5"
                        >
                          {log.status}
                        </Badge>
                        <span className="text-muted-foreground capitalize">{log.sync_type}</span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        {log.items_synced > 0 && <span>{log.items_synced} records</span>}
                        <span>{formatDistanceToNow(new Date(log.started_at), { addSuffix: true })}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Auto-sync runs every hour. Data synced: Items, Contacts → Companies, Purchase Orders → Orders.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
