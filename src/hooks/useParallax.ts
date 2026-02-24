import { useEffect, useRef, useState } from "react";

/**
 * Returns a CSS transform string that shifts the element slightly
 * based on its scroll position within the viewport.
 * @param speed - multiplier for the effect (default 0.03, subtle)
 */
export function useParallax(speed = 0.03) {
  const ref = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Find scrollable parent
    const scroller = el.closest("[data-parallax-scroll]") || el.closest("main") || window;

    let ticking = false;
    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        const viewH = window.innerHeight;
        // 0 when element is at bottom of viewport, 1 when at top
        const ratio = (viewH - rect.top) / (viewH + rect.height);
        setOffset((ratio - 0.5) * speed * 100);
        ticking = false;
      });
    };

    const target = scroller === window ? window : (scroller as HTMLElement);
    target.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => target.removeEventListener("scroll", handleScroll);
  }, [speed]);

  return { ref, style: { transform: `translateY(${offset}px)` } as React.CSSProperties };
}
