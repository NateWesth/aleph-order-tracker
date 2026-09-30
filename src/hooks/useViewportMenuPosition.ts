import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";

const VIEWPORT_MARGIN = 8;
const POINTER_GAP = 6;

/**
 * Renders right-click menus at the document root so no transformed/animated
 * ancestor can offset or clip their fixed positioning.
 */
export function MenuPortal({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}

/** Positions a floating menu beside the pointer, flipping and clamping it inside the viewport. */
export function useViewportMenuPosition(x: number, y: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({
    left: VIEWPORT_MARGIN,
    top: VIEWPORT_MARGIN,
    visibility: "hidden",
  });

  useLayoutEffect(() => {
    const menu = ref.current;
    if (!menu) return;

    const place = () => {
      const el = ref.current;
      if (!el) return;
      const viewportW = window.visualViewport?.width ?? window.innerWidth;
      const viewportH = window.visualViewport?.height ?? window.innerHeight;
      const maxH = Math.max(80, viewportH - VIEWPORT_MARGIN * 2);
      el.style.maxHeight = `${maxH}px`;

      const width = el.offsetWidth;
      const height = Math.min(el.scrollHeight, maxH);

      const fitsRight = x + POINTER_GAP + width <= viewportW - VIEWPORT_MARGIN;
      const fitsBelow = y + POINTER_GAP + height <= viewportH - VIEWPORT_MARGIN;
      const preferredLeft = fitsRight ? x + POINTER_GAP : x - width - POINTER_GAP;
      const preferredTop = fitsBelow ? y + POINTER_GAP : y - height - POINTER_GAP;

      const maxLeft = Math.max(VIEWPORT_MARGIN, viewportW - width - VIEWPORT_MARGIN);
      const maxTop = Math.max(VIEWPORT_MARGIN, viewportH - height - VIEWPORT_MARGIN);

      setStyle({
        position: "fixed",
        left: Math.min(maxLeft, Math.max(VIEWPORT_MARGIN, preferredLeft)),
        top: Math.min(maxTop, Math.max(VIEWPORT_MARGIN, preferredTop)),
        maxHeight: maxH,
        visibility: "visible",
      });
    };

    place();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(place) : null;
    observer?.observe(menu);
    window.addEventListener("resize", place);
    window.visualViewport?.addEventListener("resize", place);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", place);
      window.visualViewport?.removeEventListener("resize", place);
    };
  }, [x, y]);

  return { ref, style };
}
