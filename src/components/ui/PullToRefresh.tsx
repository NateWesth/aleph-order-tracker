import React from 'react';
import { Loader2, ArrowDown } from 'lucide-react';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { cn } from '@/lib/utils';

interface PullToRefreshProps {
  onRefresh: () => Promise<void> | void;
  children: React.ReactNode;
  className?: string;
}

export function PullToRefresh({ onRefresh, children, className }: PullToRefreshProps) {
  const { containerRef, pullDistance, refreshing, isTriggered, handlers } = usePullToRefresh({
    onRefresh,
  });

  return (
    <div
      ref={containerRef}
      className={cn("relative overflow-auto", className)}
      {...handlers}
    >
      {/* Pull indicator */}
      <div
        className="flex items-center justify-center overflow-hidden transition-[height] duration-200 ease-out"
        style={{ height: pullDistance > 0 ? `${pullDistance}px` : '0px' }}
      >
        <div className={cn(
          "flex items-center gap-2 text-sm text-muted-foreground transition-all",
          isTriggered && "text-primary"
        )}>
          {refreshing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Refreshing...</span>
            </>
          ) : (
            <>
              <ArrowDown
                className={cn(
                  "h-4 w-4 transition-transform duration-200",
                  isTriggered && "rotate-180"
                )}
              />
              <span>{isTriggered ? 'Release to refresh' : 'Pull to refresh'}</span>
            </>
          )}
        </div>
      </div>

      {children}
    </div>
  );
}
