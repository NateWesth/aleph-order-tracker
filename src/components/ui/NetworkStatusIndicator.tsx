import { useEffect, useState } from "react";
import { WifiOff, Wifi } from "lucide-react";
import { cn } from "@/lib/utils";

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

  useEffect(() => {
    const handleOffline = () => {
      setIsOnline(false);
      setShowRestored(false);
    };
    const handleOnline = () => {
      setIsOnline(true);
      setShowRestored(true);
      const t = setTimeout(() => setShowRestored(false), 2500);
      return () => clearTimeout(t);
    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  if (isOnline && !showRestored) return null;

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
            Back online
          </>
        ) : (
          <>
            <WifiOff className="h-4 w-4" />
            You're offline — changes will retry when reconnected
          </>
        )}
      </div>
    </div>
  );
}
