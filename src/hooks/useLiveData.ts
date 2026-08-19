import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Live feed: subscribes to postgres changes on the given tables and calls
 * `onChange` (debounced) whenever anything changes. Also refreshes when the
 * tab becomes visible again, plus an optional slow safety-net interval.
 */
export function useLiveData(
  tables: string[],
  onChange: () => void | Promise<void>,
  options?: {
    enabled?: boolean;
    debounceMs?: number;
    /** Safety-net polling interval in ms (0 disables). Realtime + focus recovery is the default. */
    fallbackIntervalMs?: number;
    channelName?: string;
  }
) {
  const {
    enabled = true,
    debounceMs = 400,
    fallbackIntervalMs = 0,
    channelName,
  } = options ?? {};

  const cbRef = useRef(onChange);
  useEffect(() => {
    cbRef.current = onChange;
  }, [onChange]);

  const key = tables.join(",");

  useEffect(() => {
    if (!enabled) return;

    let timer: number | undefined;
    let inFlight = false;
    let rerunRequested = false;

    const run = async () => {
      if (inFlight) {
        rerunRequested = true;
        return;
      }

      inFlight = true;
      try {
        await cbRef.current();
      } catch (error) {
        console.error(`Live data refresh failed for ${key}`, error);
      } finally {
        inFlight = false;
        if (rerunRequested) {
          rerunRequested = false;
          fire();
        }
      }
    };

    const fire = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => void run(), debounceMs);
    };

    const channel = supabase.channel(
      channelName ?? `live-${key}-${Math.random().toString(36).slice(2, 8)}`
    );

    for (const table of key.split(",").filter(Boolean)) {
      channel.on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table },
        fire
      );
    }
    channel.subscribe((status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        // Supabase reconnects the socket internally. Refreshing here prevents
        // a missed event from leaving another user's screen stale meanwhile.
        window.setTimeout(fire, 1000);
      }
    });

    const onVisible = () => {
      if (document.visibilityState === "visible") fire();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("online", onVisible);

    const interval =
      fallbackIntervalMs > 0
        ? window.setInterval(() => void run(), fallbackIntervalMs)
        : undefined;

    return () => {
      if (timer) window.clearTimeout(timer);
      if (interval) window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("online", onVisible);
      supabase.removeChannel(channel);
    };
  }, [enabled, key, debounceMs, fallbackIntervalMs, channelName]);
}
