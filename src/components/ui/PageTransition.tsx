import { useState, useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageTransitionProps {
  viewKey: string;
  children: ReactNode;
  className?: string;
}

export function PageTransition({ viewKey, children, className }: PageTransitionProps) {
  const [displayedKey, setDisplayedKey] = useState(viewKey);
  const [displayedChildren, setDisplayedChildren] = useState(children);
  const [phase, setPhase] = useState<"enter" | "exit" | "idle">("idle");
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (viewKey !== displayedKey) {
      setPhase("exit");

      timeoutRef.current = setTimeout(() => {
        setDisplayedKey(viewKey);
        setDisplayedChildren(children);
        setPhase("enter");

        timeoutRef.current = setTimeout(() => {
          setPhase("idle");
        }, 350);
      }, 180);
    } else {
      setDisplayedChildren(children);
    }

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [viewKey, children, displayedKey]);

  return (
    <div
      className={cn(
        "transition-all ease-out will-change-[transform,opacity]",
        phase === "exit" && "duration-150 opacity-0 translate-y-3 scale-[0.99]",
        phase === "enter" && "duration-300 animate-page-enter-smooth",
        phase === "idle" && "opacity-100 translate-y-0 scale-100",
        className
      )}
    >
      {displayedChildren}
    </div>
  );
}
