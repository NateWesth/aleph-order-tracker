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
      // Start exit
      setPhase("exit");

      timeoutRef.current = setTimeout(() => {
        setDisplayedKey(viewKey);
        setDisplayedChildren(children);
        setPhase("enter");

        timeoutRef.current = setTimeout(() => {
          setPhase("idle");
        }, 300);
      }, 150);
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
        "transition-all duration-200 ease-out",
        phase === "exit" && "opacity-0 translate-y-2 scale-[0.995]",
        phase === "enter" && "opacity-0 translate-y-2 scale-[0.995] animate-page-enter",
        phase === "idle" && "opacity-100 translate-y-0 scale-100",
        className
      )}
    >
      {displayedChildren}
    </div>
  );
}
