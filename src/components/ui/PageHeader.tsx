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
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3 min-w-0">
          {Icon && (
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
              <Icon className="h-[18px] w-[18px]" />
            </span>
          )}
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight leading-tight truncate">
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
              className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card/70 px-2.5 py-1 text-xs font-medium text-muted-foreground backdrop-blur-sm"
            >
              {stat.icon && <stat.icon className="h-3.5 w-3.5 text-primary/80" />}
              <span className="text-foreground font-semibold tabular-nums">{stat.value}</span>
              <span>{stat.label}</span>
            </span>
          ))}
        </div>
      )}

      {toolbar && <div className="flex flex-col sm:flex-row sm:items-center gap-2">{toolbar}</div>}

      <div className="h-px w-full bg-gradient-to-r from-border via-border/60 to-transparent" />
    </div>
  );
}

export default PageHeader;
