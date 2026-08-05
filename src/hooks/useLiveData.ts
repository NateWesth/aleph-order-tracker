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
    /** Safety-net polling interval in ms (0 disables). */
    fallbackIntervalMs?: number;
    channelName?: string;
  }
) {
  const {
    enabled = true,
    debounceMs = 400,
    fallbackIntervalMs = 5 * 60 * 1000,
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
    const fire = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => void cbRef.current(), debounceMs);
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
    channel.subscribe();

    const onVisible = () => {
      if (document.visibilityState === "visible") fire();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    const interval =
      fallbackIntervalMs > 0
        ? window.setInterval(() => void cbRef.current(), fallbackIntervalMs)
        : undefined;

    return () => {
      if (timer) window.clearTimeout(timer);
      if (interval) window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      supabase.removeChannel(channel);
    };
  }, [enabled, key, debounceMs, fallbackIntervalMs, channelName]);
}
