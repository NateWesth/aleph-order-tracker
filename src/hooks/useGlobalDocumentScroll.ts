import { useEffect } from "react";

const isVerticallyScrollable = (element: HTMLElement, deltaY: number) => {
  const style = window.getComputedStyle(element);
  const overflowY = style.overflowY;
  if (overflowY !== "auto" && overflowY !== "scroll") return false;
  if (element.scrollHeight <= element.clientHeight + 1) return false;

  if (deltaY > 0) return element.scrollTop + element.clientHeight < element.scrollHeight - 1;
  if (deltaY < 0) return element.scrollTop > 1;
  return false;
};

const findScrollableAncestor = (target: EventTarget | null, deltaY: number) => {
  let node = target instanceof HTMLElement ? target : null;

  // Never scroll the document behind a modal / popover / purpose-built scroll viewport.
  const overlayOwner = node?.closest<HTMLElement>(
    '[role="dialog"], [data-radix-popper-content-wrapper], [data-radix-scroll-area-viewport], [data-global-scroll-ignore="true"]'
  );
  if (overlayOwner) return overlayOwner;

  while (node && node !== document.body && node !== document.documentElement) {
    if (isVerticallyScrollable(node, deltaY)) return node;
    node = node.parentElement;
  }

  return null;
};

/**
 * Defensive wheel fallback for the application shell.
 * Normal page content always scrolls the document, while genuine bounded
 * scroll regions (dialogs, popovers, timelines, comment feeds, etc.) retain
 * their own wheel behavior.
 */
export const useGlobalDocumentScroll = () => {
  useEffect(() => {
    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey || event.defaultPrevented) return;
      if (!Number.isFinite(event.deltaY) || Math.abs(event.deltaY) < 0.01) return;

      const scrollable = findScrollableAncestor(event.target, event.deltaY);
      if (scrollable) return;

      // Horizontal trackpad movement must never move the page sideways.
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY) && Math.abs(event.deltaY) < 1) {
        event.preventDefault();
        return;
      }

      const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      if (maxScroll <= 0) return;

      event.preventDefault();
      window.scrollBy({ top: event.deltaY, left: 0, behavior: "auto" });
    };

    window.addEventListener("wheel", handleWheel, { passive: false, capture: true });
    return () => window.removeEventListener("wheel", handleWheel, true);
  }, []);
};
