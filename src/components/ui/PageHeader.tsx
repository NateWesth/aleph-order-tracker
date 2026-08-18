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
  toolbar?: ReactNode;
  className?: string;
}

export function PageHeader({ title, description, icon: Icon, stats, actions, toolbar, className }: PageHeaderProps) {
  return (
    <section
      className={cn(
        "relative isolate overflow-hidden rounded-[22px] border border-border/70 bg-card/90 shadow-[0_24px_60px_-48px_hsl(var(--foreground)/0.45)] backdrop-blur-xl",
        className,
      )}
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/45 to-transparent" aria-hidden />
      <div className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-primary/[0.07] blur-3xl" aria-hidden />

      <div className="relative space-y-4 p-4 sm:p-5 lg:p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3.5">
            {Icon && (
              <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-primary/15 bg-primary/10 text-primary shadow-sm">
                <Icon className="h-5 w-5" />
              </span>
            )}
            <div className="min-w-0">
              <h1 className="font-display text-xl sm:text-2xl lg:text-[1.75rem] font-extrabold tracking-[-0.035em] leading-tight text-foreground">
                {title}
              </h1>
              {description && <p className="mt-1 max-w-3xl text-xs sm:text-sm text-muted-foreground line-clamp-2">{description}</p>}
            </div>
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2 lg:justify-end">{actions}</div>}
        </div>

        {stats && stats.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {stats.map((stat) => (
              <span key={stat.label} className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/55 px-3 py-1.5 text-xs font-medium shadow-sm backdrop-blur">
                {stat.icon && <stat.icon className="h-3.5 w-3.5 text-primary" />}
                <span className="font-extrabold tabular-nums text-foreground">{stat.value}</span>
                <span className="text-muted-foreground">{stat.label}</span>
              </span>
            ))}
          </div>
        )}

        {toolbar && <div className="flex flex-col gap-2 border-t border-border/60 pt-3 sm:flex-row sm:items-center">{toolbar}</div>}
      </div>
    </section>
  );
}

export default PageHeader;
