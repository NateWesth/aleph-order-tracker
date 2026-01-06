import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// Order card skeleton for kanban boards
export function OrderCardSkeleton({ className }: { className?: string }) {
  return (
    <Card className={cn("bg-card border-border overflow-hidden", className)}>
      <CardContent className="p-3">
        <div className="space-y-2.5">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="h-5 w-12 rounded-full" />
          </div>
          
          {/* Description */}
          <div className="space-y-1">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-3/4" />
          </div>
          
          {/* Items button */}
          <Skeleton className="h-8 w-full rounded-lg" />
          
          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            <Skeleton className="h-8 flex-1 rounded-lg" />
            <Skeleton className="h-8 w-8 rounded-lg" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Column skeleton for kanban board
export function KanbanColumnSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="flex flex-col min-w-[300px] max-w-[340px] flex-1">
      {/* Header */}
      <div className="px-4 py-3 rounded-t-xl bg-muted">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-5 w-8 rounded-full" />
        </div>
      </div>
      
      {/* Content */}
      <div className="flex-1 bg-muted/30 dark:bg-muted/10 rounded-b-xl border border-t-0 border-border min-h-[400px] p-3 space-y-2">
        {Array.from({ length: count }).map((_, i) => (
          <OrderCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

// Full orders page skeleton
export function OrdersPageSkeleton() {
  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header skeleton */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-[200px] rounded-xl" />
          <Skeleton className="h-10 w-28 rounded-xl" />
        </div>
      </div>
      
      {/* Kanban board skeleton */}
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-4 min-w-max">
          <KanbanColumnSkeleton count={2} />
          <KanbanColumnSkeleton count={3} />
          <KanbanColumnSkeleton count={1} />
          <KanbanColumnSkeleton count={2} />
        </div>
      </div>
    </div>
  );
}

// Table row skeleton
export function TableRowSkeleton({ columns = 5 }: { columns?: number }) {
  return (
    <tr className="border-b border-border">
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="p-3">
          <Skeleton className={cn(
            "h-4",
            i === 0 ? "w-16" : i === columns - 1 ? "w-16 ml-auto" : "w-full max-w-[200px]"
          )} />
        </td>
      ))}
    </tr>
  );
}

// Table skeleton
export function TableSkeleton({ rows = 5, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="rounded-xl border border-border overflow-hidden animate-fade-in">
      <table className="w-full">
        <thead className="bg-muted/50">
          <tr>
            {Array.from({ length: columns }).map((_, i) => (
              <th key={i} className="p-3 text-left">
                <Skeleton className="h-4 w-16" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, i) => (
            <TableRowSkeleton key={i} columns={columns} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Dashboard stats skeleton
export function StatCardSkeleton() {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-lg" />
        <div className="space-y-1.5 flex-1">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-6 w-12" />
        </div>
      </div>
    </Card>
  );
}

// Generic page loading skeleton
export function PageSkeleton() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-32 rounded-xl" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>
      <TableSkeleton rows={8} columns={5} />
    </div>
  );
}

// Items page skeleton
export function ItemsPageSkeleton() {
  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-9 w-64 rounded-xl" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-28 rounded-xl" />
          <Skeleton className="h-9 w-24 rounded-xl" />
        </div>
      </div>
      <Skeleton className="h-4 w-32" />
      <TableSkeleton rows={10} columns={5} />
    </div>
  );
}

// Completed orders skeleton
export function CompletedPageSkeleton() {
  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-20" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-10 flex-1 max-w-sm rounded-xl" />
        <Skeleton className="h-10 w-48 rounded-xl" />
      </div>
      <TableSkeleton rows={6} columns={4} />
    </div>
  );
}
