import { useEffect, useRef } from "react";

/**
 * Automatically re-runs a fetch callback:
 *  - on a fixed interval
 *  - when the tab becomes visible again
 *  - when the window regains focus (throttled by `focusMinIntervalMs`)
 */
export function useAutoRefresh(
  callback: () => void | Promise<void>,
  intervalMs: number,
  options?: { enabled?: boolean; refreshOnFocus?: boolean; focusMinIntervalMs?: number }
) {
  const { enabled = true, refreshOnFocus = true, focusMinIntervalMs = 60_000 } = options ?? {};
  const cbRef = useRef(callback);
  const lastRunRef = useRef<number>(Date.now());

  useEffect(() => {
    cbRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) return;

    const run = () => {
      lastRunRef.current = Date.now();
      void cbRef.current();
    };

    const timer = intervalMs > 0 ? window.setInterval(run, intervalMs) : undefined;

    const onFocus = () => {
      if (!refreshOnFocus) return;
      if (document.visibilityState === "hidden") return;
      if (Date.now() - lastRunRef.current < focusMinIntervalMs) return;
      run();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);

    return () => {
      if (timer) window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [enabled, intervalMs, refreshOnFocus, focusMinIntervalMs]);
}
