import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";

const VIEWPORT_MARGIN = 8;
const POINTER_GAP = 6;

/** Positions a floating menu beside the pointer, flipping and clamping it inside the viewport. */
export function useViewportMenuPosition(x: number, y: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({
    left: VIEWPORT_MARGIN,
    top: VIEWPORT_MARGIN,
    visibility: "hidden",
  });

  useLayoutEffect(() => {
    const place = () => {
      const menu = ref.current;
      if (!menu) return;

      const { width, height } = menu.getBoundingClientRect();
      const maxLeft = Math.max(VIEWPORT_MARGIN, window.innerWidth - width - VIEWPORT_MARGIN);
      const maxTop = Math.max(VIEWPORT_MARGIN, window.innerHeight - height - VIEWPORT_MARGIN);
      const preferredLeft = x + POINTER_GAP + width <= window.innerWidth - VIEWPORT_MARGIN
        ? x + POINTER_GAP
        : x - width - POINTER_GAP;
      const preferredTop = y + POINTER_GAP + height <= window.innerHeight - VIEWPORT_MARGIN
        ? y + POINTER_GAP
        : y - height - POINTER_GAP;

      setStyle({
        left: Math.min(maxLeft, Math.max(VIEWPORT_MARGIN, preferredLeft)),
        top: Math.min(maxTop, Math.max(VIEWPORT_MARGIN, preferredTop)),
        visibility: "visible",
      });
    };

    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [x, y]);

  return { ref, style };
}