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
        "aleph-command-header relative isolate overflow-hidden rounded-[28px] border border-border/60 bg-card/88 shadow-[0_28px_75px_-48px_hsl(var(--foreground)/0.5)] backdrop-blur-xl",
        className,
      )}
    >
      <div className="absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b from-primary via-primary/45 to-transparent" aria-hidden />
      <div className="pointer-events-none absolute -right-12 -top-24 h-64 w-64 rounded-full bg-primary/[0.09] blur-3xl" aria-hidden />

      <div className="relative">
        <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:p-7">
          <div className="flex min-w-0 items-center gap-4 sm:gap-5">
            {Icon && (
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] border border-primary/15 bg-gradient-to-br from-primary/18 to-primary/5 text-primary shadow-[0_18px_35px_-24px_hsl(var(--primary))] sm:h-16 sm:w-16">
                <Icon className="h-6 w-6 sm:h-7 sm:w-7" />
              </span>
            )}
            <div className="min-w-0">
              <p className="mb-1 text-[10px] font-black uppercase tracking-[0.22em] text-primary/80">Workspace</p>
              <h1 className="font-display text-2xl font-black leading-none tracking-[-0.045em] text-foreground sm:text-3xl lg:text-[2.15rem]">
                {title}
              </h1>
              {description && <p className="mt-2 max-w-3xl text-xs leading-relaxed text-muted-foreground sm:text-sm">{description}</p>}
            </div>
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2 lg:max-w-lg lg:justify-end">{actions}</div>}
        </div>

        {stats && stats.length > 0 && (
          <div className="grid grid-cols-2 gap-px border-y border-border/55 bg-border/55 sm:flex sm:border-b-0">
            {stats.map((stat) => (
              <div key={stat.label} className="flex min-w-[145px] items-center gap-3 bg-background/55 px-4 py-3 backdrop-blur sm:flex-1 sm:px-5">
                {stat.icon && <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10"><stat.icon className="h-4 w-4 text-primary" /></span>}
                <span className="min-w-0">
                  <span className="block font-display text-lg font-black tabular-nums leading-none text-foreground">{stat.value}</span>
                  <span className="mt-1 block truncate text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{stat.label}</span>
                </span>
              </div>
            ))}
          </div>
        )}

        {toolbar && <div className="aleph-page-command-dock flex flex-col gap-2 border-t border-border/55 bg-muted/30 p-3 sm:flex-row sm:items-center sm:px-5">{toolbar}</div>}
      </div>
    </section>
  );
}

export default PageHeader;
