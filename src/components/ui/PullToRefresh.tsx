import React from 'react';
import { cn } from '@/lib/utils';

interface PullToRefreshProps {
  onRefresh?: () => Promise<void> | void;
  children: React.ReactNode;
  className?: string;
}

/**
 * Pull-to-refresh has been retired app-wide — data now streams in live.
 * This wrapper is kept as a plain layout container so existing pages
 * continue to render unchanged.
 */
export function PullToRefresh({ children, className }: PullToRefreshProps) {
  return <div className={cn("relative", className)}>{children}</div>;
}
