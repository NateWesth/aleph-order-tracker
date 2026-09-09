import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageTransitionProps {
  viewKey: string;
  children: ReactNode;
  className?: string;
}

export function PageTransition({ viewKey, children, className }: PageTransitionProps) {
  // Render immediately. Animation must never gate navigation or keep a stale page alive.
  return (
    <div
      key={viewKey}
      className={cn(
        "animate-in fade-in duration-200 motion-reduce:animate-none",
        className
      )}
    >
      {children}
    </div>
  );
}
