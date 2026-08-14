import { ReactNode } from "react";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PageHeaderStat {
  label: string;
  value: ReactNode;
  icon?: LucideIcon;
}

interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  icon?: LucideIcon;
  stats?: PageHeaderStat[];
  actions?: ReactNode;
  /** Optional row rendered beneath the header (search, filters, tabs) */
  toolbar?: ReactNode;
  className?: string;
}

/**
 * Consistent page header used across admin pages.
 * Keeps title / meta / actions on one visual line and pushes
 * secondary controls into a clearly separated toolbar row.
 */
export function PageHeader({
  title,
  description,
  icon: Icon,
  stats,
  actions,
  toolbar,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn("space-y-4 rounded-2xl border-2 border-border bg-card shadow-soft overflow-hidden relative", className)}>
      <div className="ribbon-bar" aria-hidden />
      <div className="p-4 sm:p-5 space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3 min-w-0">
            {Icon && (
              <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15 shadow-sm">
                <Icon className="h-5 w-5" />
              </span>
            )}
            <div className="min-w-0">
              <h1 className="font-display text-xl sm:text-2xl font-bold tracking-tight leading-tight truncate text-foreground">
                {title}
              </h1>
              {description && (
                <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 line-clamp-2">
                  {description}
                </p>
              )}
            </div>
          </div>

          {actions && (
            <div className="flex flex-wrap items-center gap-2 lg:justify-end">{actions}</div>
          )}
        </div>

        {stats && stats.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {stats.map((stat) => (
              <span
                key={stat.label}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary/5 border border-primary/10 px-2.5 py-1 text-xs font-medium text-muted-foreground"
              >
                {stat.icon && <stat.icon className="h-3.5 w-3.5 text-primary/80" />}
                <span className="text-foreground font-bold tabular-nums">{stat.value}</span>
                <span>{stat.label}</span>
              </span>
            ))}
          </div>
        )}

        {toolbar && <div className="flex flex-col sm:flex-row sm:items-center gap-2">{toolbar}</div>}
      </div>
    </div>
  );
}

export default PageHeader;
