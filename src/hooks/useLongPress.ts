import { useCallback, useRef } from "react";
import { triggerHapticFeedback } from "@/utils/haptics";

interface Options {
  onLongPress: () => void;
  delay?: number;
  moveTolerance?: number;
}

/**
 * Detects a long-press gesture on touch devices.
 * Triggers haptic feedback when the press fires.
 */
export function useLongPress({ onLongPress, delay = 500, moveTolerance = 10 }: Options) {
  const timer = useRef<number | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  const clear = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    start.current = null;
  }, []);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    fired.current = false;
    start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    timer.current = window.setTimeout(() => {
      fired.current = true;
      triggerHapticFeedback("medium");
      onLongPress();
    }, delay);
  }, [delay, onLongPress]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!start.current || timer.current === null) return;
    const dx = e.touches[0].clientX - start.current.x;
    const dy = e.touches[0].clientY - start.current.y;
    if (Math.abs(dx) > moveTolerance || Math.abs(dy) > moveTolerance) {
      clear();
    }
  }, [clear, moveTolerance]);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (fired.current) {
      // Prevent the click event that follows the touch
      e.preventDefault();
      e.stopPropagation();
    }
    clear();
  }, [clear]);

  const onTouchCancel = useCallback(() => clear(), [clear]);

  return { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel, didLongPress: () => fired.current };
}
