import { useEffect, useState } from "react";
import { WifiOff, Wifi } from "lucide-react";
import { cn } from "@/lib/utils";
import { flushOfflineOperations, subscribeOfflineQueue } from "@/services/offlineOperations";

/**
 * Floating pill that appears when the browser goes offline and
 * briefly confirms when the connection is restored. Purely presentational —
 * relies on the browser online/offline events.
 */
export function NetworkStatusIndicator() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [showRestored, setShowRestored] = useState(false);
  const [pendingChanges, setPendingChanges] = useState(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    let restoredTimer: number | undefined;
    const handleOffline = () => {
      if (restoredTimer) window.clearTimeout(restoredTimer);
      setIsOnline(false);
      setShowRestored(false);
    };
    const handleOnline = () => {
      setIsOnline(true);
      setShowRestored(true);
      setSyncing(true);
      void flushOfflineOperations().finally(() => setSyncing(false));
      if (restoredTimer) window.clearTimeout(restoredTimer);
      restoredTimer = window.setTimeout(() => setShowRestored(false), 2500);
    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      if (restoredTimer) window.clearTimeout(restoredTimer);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  useEffect(() => subscribeOfflineQueue(setPendingChanges), []);

  if (isOnline && !showRestored && pendingChanges === 0 && !syncing) return null;

  return (
    <div
      className={cn(
        "fixed z-[100] left-1/2 -translate-x-1/2 top-4 pointer-events-none",
        "animate-fade-in"
      )}
      role="status"
      aria-live="polite"
    >
      <div
        className={cn(
          "flex items-center gap-2 px-4 py-2 rounded-full shadow-lg backdrop-blur-md border text-sm font-medium",
          isOnline
            ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-600 dark:text-emerald-300"
            : "bg-destructive/15 border-destructive/40 text-destructive"
        )}
      >
        {isOnline ? (
          <>
            <Wifi className="h-4 w-4" />
            {syncing ? `Syncing ${pendingChanges} saved change${pendingChanges === 1 ? "" : "s"}…` : pendingChanges ? `${pendingChanges} change${pendingChanges === 1 ? "" : "s"} waiting to sync` : "Back online · all changes synced"}
          </>
        ) : (
          <>
            <WifiOff className="h-4 w-4" />
            Offline mode · {pendingChanges ? `${pendingChanges} change${pendingChanges === 1 ? "" : "s"} safely queued` : "changes will be safely queued"}
          </>
        )}
      </div>
    </div>
  );
}
