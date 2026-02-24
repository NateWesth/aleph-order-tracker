import { Skeleton } from "@/components/ui/skeleton";

interface PageSkeletonProps {
  variant?: "default" | "table" | "kanban" | "stats" | "cards" | "dashboard" | "suppliers" | "heatmap" | "scorecard";
}

export function PageSkeleton({ variant = "default" }: PageSkeletonProps) {
  if (variant === "dashboard") {
    return (
      <div className="space-y-6">
        {/* Greeting */}
        <div className="stagger-reveal">
          <Skeleton className="h-8 w-64 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="stagger-reveal glass-card glow-border rounded-xl p-4">
              <Skeleton className="h-5 w-5 rounded mb-3" />
              <Skeleton className="h-8 w-16 mb-1" />
              <Skeleton className="h-3 w-20" />
            </div>
          ))}
        </div>

        {/* Bottom panels */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="stagger-reveal glass-card glow-border rounded-xl p-6">
            <Skeleton className="h-4 w-24 mb-4" />
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full mb-3 rounded-xl" />
            ))}
          </div>
          <div className="stagger-reveal glass-card glow-border rounded-xl p-6 lg:col-span-2">
            <Skeleton className="h-4 w-28 mb-4" />
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-10 w-full mb-2 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (variant === "suppliers") {
    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="stagger-reveal flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="h-7 w-32" />
          </div>
          <Skeleton className="h-9 w-28" />
        </div>

        {/* Search */}
        <div className="stagger-reveal">
          <Skeleton className="h-9 w-full max-w-sm" />
        </div>

        {/* Table */}
        <div className="stagger-reveal bg-card rounded-lg border">
          <div className="p-4 border-b">
            <div className="flex gap-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-4 flex-1" />
              ))}
            </div>
          </div>
          {[1, 2, 3, 4, 5].map((row) => (
            <div key={row} className="stagger-reveal p-4 border-b last:border-b-0">
              <div className="flex gap-4 items-center">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-16" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (variant === "heatmap") {
    return (
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="stagger-reveal flex items-center gap-2 mb-4">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <div>
            <Skeleton className="h-4 w-40 mb-1" />
            <Skeleton className="h-3 w-52" />
          </div>
        </div>
        <div className="stagger-reveal">
          <Skeleton className="h-48 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  if (variant === "scorecard") {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="stagger-reveal bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1">
                <Skeleton className="h-4 w-28 mb-2" />
                <Skeleton className="h-2 w-full rounded-full" />
              </div>
              <Skeleton className="h-6 w-12 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (variant === "stats") {
    return (
      <div className="space-y-6">
        {/* Date filter skeleton */}
        <div className="stagger-reveal flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-8 w-20" />
          ))}
          <Skeleton className="h-8 w-24" />
        </div>
        
        {/* Metric cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="stagger-reveal bg-card border border-border rounded-xl p-5">
              <Skeleton className="h-4 w-20 mb-3" />
              <Skeleton className="h-8 w-16" />
            </div>
          ))}
        </div>
        
        {/* Charts */}
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="stagger-reveal bg-card border border-border rounded-xl p-6">
            <Skeleton className="h-4 w-28 mb-6" />
            <Skeleton className="h-48 w-full" />
          </div>
          <div className="stagger-reveal bg-card border border-border rounded-xl p-6">
            <Skeleton className="h-4 w-32 mb-6" />
            <Skeleton className="h-48 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (variant === "kanban") {
    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="stagger-reveal flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Skeleton className="h-8 w-40 mb-2" />
            <Skeleton className="h-4 w-24" />
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-[200px]" />
            <Skeleton className="h-9 w-28" />
          </div>
        </div>
        
        {/* Kanban columns */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {[1, 2, 3, 4].map((col) => (
            <div key={col} className="stagger-reveal bg-muted/30 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-3">
                <Skeleton className="h-5 w-5 rounded" />
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-5 w-6 ml-auto rounded-full" />
              </div>
              <div className="space-y-2">
                {[1, 2, 3].map((card) => (
                  <div key={card} className="bg-card rounded-lg p-3 border">
                    <Skeleton className="h-4 w-20 mb-2" />
                    <Skeleton className="h-3 w-full mb-1" />
                    <Skeleton className="h-3 w-2/3" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (variant === "table") {
    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="stagger-reveal flex items-center justify-between gap-4">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-9 w-28" />
        </div>
        
        {/* Table */}
        <div className="stagger-reveal bg-card rounded-lg border">
          <div className="p-4 border-b">
            <div className="flex gap-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-4 flex-1" />
              ))}
            </div>
          </div>
          {[1, 2, 3, 4, 5, 6, 7, 8].map((row) => (
            <div key={row} className="stagger-reveal p-4 border-b last:border-b-0">
              <div className="flex gap-4 items-center">
                {[1, 2, 3, 4].map((cell) => (
                  <Skeleton key={cell} className="h-4 flex-1" />
                ))}
                <Skeleton className="h-8 w-20" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (variant === "cards") {
    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="stagger-reveal flex items-center justify-between gap-4">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-9 w-28" />
        </div>
        
        {/* Cards grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="stagger-reveal bg-card rounded-lg border p-4">
              <div className="flex items-center gap-3 mb-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-32 mb-1" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
              <Skeleton className="h-3 w-full mb-1" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Default skeleton
  return (
    <div className="space-y-4">
      <div className="stagger-reveal">
        <Skeleton className="h-8 w-64" />
      </div>
      <div className="stagger-reveal">
        <Skeleton className="h-4 w-96" />
      </div>
      <div className="stagger-reveal space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </div>
  );
}
