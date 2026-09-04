import type { ReactNode } from "react";
import { AlertTriangle, CalendarDays, CheckCircle2, Clock3, Search, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export const SERVICE_STATUSES = [
  ["not_started", "Not started"],
  ["next", "Next"],
  ["awaiting_quote_approval", "Awaiting quote approval"],
  ["pending_sent_in", "Pending / sent in"],
  ["working_on_it", "Working on it"],
  ["completed", "Completed"],
] as const;

export const PRIORITIES = [
  ["low", "Low"], ["normal", "Normal"], ["high", "High"], ["urgent", "Urgent"],
] as const;

export type ServiceStatus = typeof SERVICE_STATUSES[number][0];
export type ServicePriority = typeof PRIORITIES[number][0];
export interface TeamMember { id: string; full_name: string | null; email: string | null }

export const statusLabel = (status: string) => SERVICE_STATUSES.find(([value]) => value === status)?.[1] || status.replace(/_/g, " ");
export const memberLabel = (member?: TeamMember | null) => member?.full_name || member?.email || "Unassigned";
export const formatDate = (date?: string | null) => date ? new Date(`${date}T12:00:00`).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" }) : "Not set";
export const monthLabel = (date?: string | null) => date ? new Date(`${date}T12:00:00`).toLocaleDateString("en-ZA", { month: "long", year: "numeric" }) : "Date not set";
export const isOverdue = (deadline?: string | null, complete = false) => !!deadline && !complete && new Date(`${deadline}T23:59:59`).getTime() < Date.now();

/** Soft, logo-coded status chip (matches the board's status colours). */
export function StatusBadge({ status }: { status: string }) {
  const tone = status === "completed" ? "border-logo-cyan/30 bg-logo-cyan/12 text-logo-cyan"
    : status === "working_on_it" ? "border-logo-magenta/30 bg-logo-magenta/12 text-logo-magenta"
    : status === "next" ? "border-logo-teal/30 bg-logo-teal/12 text-logo-teal"
    : status === "awaiting_quote_approval" ? "border-logo-pink/30 bg-logo-pink/12 text-logo-pink"
    : status === "pending_sent_in" ? "border-logo-violet/30 bg-logo-violet/12 text-logo-violet"
    : "border-border/60 bg-muted/60 text-muted-foreground";
  return <Badge variant="outline" className={cn("rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide", tone)}>{statusLabel(status)}</Badge>;
}

export function PriorityBadge({ priority }: { priority: string }) {
  if (priority === "normal" || priority === "low") return null;
  return <Badge className={cn("rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase text-white", priority === "urgent" ? "bg-logo-magenta hover:bg-logo-magenta" : "bg-logo-pink hover:bg-logo-pink")}>{priority}</Badge>;
}


/** Compact, editorial page header — no gradients, no glass. */
export function WorkshopHeader({ eyebrow, title, description, stats, children }: {
  eyebrow: string; title: string; description: string;
  stats: { label: string; value: ReactNode; tone?: "default" | "warning" | "danger" }[];
  children?: ReactNode;
}) {
  return <header className="overflow-hidden rounded-lg border border-border bg-card font-sans shadow-sm">
    <div className="flex flex-col gap-4 border-b border-border p-4 sm:px-6 sm:py-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <p className="font-display text-[10px] font-bold uppercase text-muted-foreground">{eyebrow}</p>
        <h1 className="mt-1 font-display text-2xl font-bold sm:text-3xl">{title}</h1>
        <p className="mt-1 max-w-2xl text-sm leading-5 text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
    <dl className="grid grid-cols-2 divide-x divide-border sm:grid-cols-4">
      {stats.map((stat) => <div key={stat.label} className="px-4 py-3">
        <dt className="font-display text-[10px] font-bold uppercase text-muted-foreground">{stat.label}</dt>
        <dd className={cn("mt-0.5 text-xl font-bold tabular-nums",
          stat.tone === "danger" && "text-destructive",
          stat.tone === "warning" && "text-warning")}>{stat.value}</dd>
      </div>)}
    </dl>
  </header>;
}

/** Backwards-compatible hero shim. */
export function WorkshopHero({ eyebrow, title, description, count, overdue, children }: { eyebrow: string; title: string; description: string; count: number; overdue: number; children: ReactNode }) {
  return <WorkshopHeader eyebrow={eyebrow} title={title} description={description} stats={[
    { label: "Outstanding", value: count },
    { label: "Overdue", value: overdue, tone: overdue > 0 ? "danger" : "default" },
  ]}>{children}</WorkshopHeader>;
}

export function WorkshopToolbar({ query, onQuery, placeholder = "Search reference, customer or tool…", children }: { query: string; onQuery: (value: string) => void; placeholder?: string; children: ReactNode }) {
  return <div className="sticky top-0 z-20 flex flex-col gap-2 border border-border bg-card p-2 sm:flex-row sm:items-center sm:justify-between">
    <div className="relative min-w-0 flex-1 sm:max-w-sm">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input value={query} onChange={(event) => onQuery(event.target.value)} placeholder={placeholder} className="h-10 rounded-lg pl-9" />
    </div>{children}
  </div>;
}

export function WorkshopTabs({ value, onChange, tabs }: { value: string; onChange: (value: string) => void; tabs: { id: string; label: string; count: number }[] }) {
  return <div className="flex rounded-lg border border-border bg-muted/40 p-1">
    {tabs.map((tab) => <button key={tab.id} type="button" onClick={() => onChange(tab.id)}
      className={cn("flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold transition",
        value === tab.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
      {tab.label}
      <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold tabular-nums", value === tab.id ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>{tab.count}</span>
    </button>)}
  </div>;
}

export function MonthDivider({ label, count, noun }: { label: string; count: number; noun: string }) {
  return <div className="mb-2 flex items-center gap-3 pt-1">
    <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{label}</h2>
    <span className="h-px flex-1 bg-border" />
    <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">{count} {noun}{count === 1 ? "" : "s"}</span>
  </div>;
}

export const STATUS_ORDER = ["working_on_it", "next", "awaiting_quote_approval", "pending_sent_in", "not_started", "completed", "scrapped"];

export function statusRank(status: string) {
  const index = STATUS_ORDER.indexOf(status);
  return index === -1 ? STATUS_ORDER.length : index;
}

/** Groups records by status (queue order) and sorts each group by date, newest first. */
export function groupByStatus<T>(rows: T[], getStatus: (row: T) => string, getDate: (row: T) => string) {
  const map = new Map<string, T[]>();
  rows.forEach((row) => {
    const key = getStatus(row);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(row);
  });
  const presentStatuses = Array.from(map.keys());
  const historyOnly = presentStatuses.length > 0 && presentStatuses.every((status) => status === "completed" || status === "scrapped");
  if (!historyOnly) {
    STATUS_ORDER.filter((status) => status !== "completed" && status !== "scrapped").forEach((status) => {
      if (!map.has(status)) map.set(status, []);
    });
  }
  return Array.from(map.entries())
    .sort((a, b) => statusRank(a[0]) - statusRank(b[0]))
    .map(([status, group]) => [status, group.sort((a, b) => getDate(b).localeCompare(getDate(a)))] as [string, T[]]);
}

export function StatusGroup({ status, count, children }: { status: string; count: number; children: ReactNode }) {
  return <section className={cn("overflow-hidden rounded-xl border border-border bg-card", status === "working_on_it" && "border-primary/35 bg-primary/[0.04]")}>
    <div className="flex h-10 items-center gap-2 border-b border-border bg-muted/40 px-3">
      <StatusBadge status={status} />
      <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">{count}</span>
      <span className="ml-auto font-display text-[9px] font-semibold uppercase text-muted-foreground">Newest first</span>
    </div>
    <div className="divide-y divide-border">{children}</div>
  </section>;
}

/** Wide horizontal list row for a categorized vertical layout. */
export function WorkshopRow({ reference, primary, secondary, date, dateLabel, assignee, deadline, overdue, tags, active, muted, onClick }: {
  reference: string; primary: ReactNode; secondary?: ReactNode; date: string; dateLabel?: string;
  assignee?: string; deadline?: string | null; overdue?: boolean; tags?: ReactNode;
  active?: boolean; muted?: boolean; onClick: () => void;
}) {
  return <button type="button" onClick={onClick}
    className={cn("group flex w-full items-center gap-3 border-l-[3px] border-l-muted-foreground/35 bg-card px-3 py-3 text-left transition hover:border-l-primary hover:bg-accent/20 sm:px-4 sm:py-3.5",
      active && "border-l-primary bg-primary/[0.06]", overdue && "border-l-destructive", muted && "opacity-70")}>
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-mono text-[11px] font-bold uppercase text-muted-foreground">{reference}</span>
        <span className="truncate text-sm font-semibold text-foreground">{primary}</span>
        {secondary && <span className="hidden truncate text-xs text-muted-foreground sm:inline">{secondary}</span>}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5 sm:hidden">
        {tags}
      </div>
    </div>
    <div className="hidden flex-1 items-center gap-4 sm:flex">
      <div className="flex flex-1 items-center gap-1.5">{tags}</div>
      <div className="flex shrink-0 items-center gap-4 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1"><UserRound className="h-3 w-3" />{assignee || "Unassigned"}</span>
        <span className={cn("tabular-nums", overdue && "font-bold text-destructive")}>
          {deadline ? `Due ${formatDate(deadline)}` : `${dateLabel || "Received"} ${formatDate(date)}`}
        </span>
      </div>
    </div>
    <div className="flex shrink-0 flex-col items-end gap-0.5 text-[11px] text-muted-foreground sm:hidden">
      <span className="flex items-center gap-1"><UserRound className="h-3 w-3" />{assignee || "Unassigned"}</span>
      <span className={cn("tabular-nums", overdue && "font-bold text-destructive")}>
        {deadline ? `Due ${formatDate(deadline)}` : formatDate(date)}
      </span>
    </div>
  </button>;
}

export function ListHeadings(_: { columns: string[] }) {
  return null;
}

export function EmptyWorkshop({ history = false }: { history?: boolean }) {
  return <div className="rounded-xl border border-dashed border-border bg-card px-5 py-14 text-center">
    <span className="mx-auto grid h-11 w-11 place-items-center rounded-lg bg-success/10 text-success"><CheckCircle2 className="h-5 w-5" /></span>
    <h3 className="mt-3 font-bold">{history ? "No matching history" : "Workshop queue is clear"}</h3>
    <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{history ? "Completed work remains safely searchable here." : "New manual work will appear here as soon as a team member adds it."}</p>
  </div>;
}

/** Right-hand detail drawer used for workshop detail — solid surface, logo-spectrum rail. */
export function WorkshopPanel({ open, onOpenChange, icon, reference, title, subtitle, badges, overlay, children, actions }: {
  open: boolean; onOpenChange: (open: boolean) => void;
  icon: ReactNode; reference: string; title: string; subtitle?: ReactNode; badges?: ReactNode; overlay?: ReactNode;
  children: ReactNode; actions?: ReactNode;
}) {
  return <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent side="right" className="flex w-full flex-col gap-0 border-l border-border bg-card p-0 sm:max-w-xl">
      {overlay}
      <div className="h-1 w-full shrink-0 bg-[linear-gradient(90deg,hsl(var(--logo-cyan)),hsl(var(--logo-teal)),hsl(var(--logo-violet)),hsl(var(--logo-magenta)),hsl(var(--logo-pink)))]" />
      <SheetHeader className="space-y-0 border-b border-border bg-muted/30 px-5 py-4 text-left sm:px-6">
        <div className="flex items-start gap-3 pr-8">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-logo-cyan/12 text-logo-cyan ring-1 ring-inset ring-logo-cyan/25">{icon}</span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{reference}</p>
            <SheetTitle className="truncate text-lg font-bold sm:text-xl">{title}</SheetTitle>
            {subtitle && <div className="mt-0.5 truncate text-sm text-muted-foreground">{subtitle}</div>}
            {badges && <div className="mt-2 flex flex-wrap gap-1.5">{badges}</div>}
          </div>
        </div>
      </SheetHeader>
      <div className="min-h-0 flex-1 overflow-y-auto bg-card p-5 sm:p-6"><div className="space-y-5">{children}</div></div>
      {actions && <div className="flex flex-col gap-2 border-t border-border bg-muted/30 p-4 sm:flex-row sm:justify-end sm:px-6">{actions}</div>}
    </SheetContent>
  </Sheet>;
}



export function DetailSection({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return <section className={cn("border-t border-border pt-5", className)}>
    <p className="mb-4 font-display text-[10px] font-bold uppercase text-muted-foreground">{title}</p>
    {children}
  </section>;
}

export function DetailValue({ label, value, icon }: { label: string; value?: ReactNode; icon?: ReactNode }) {
  return <div className="min-w-0 py-1">
    <p className="flex items-center gap-1.5 font-display text-[9px] font-bold uppercase text-muted-foreground">{icon}{label}</p>
    <div className="mt-1 break-words text-sm font-medium text-foreground">{value || "—"}</div>
  </div>;
}

export function AssignmentLine({ member, deadline, overdue }: { member?: TeamMember | null; deadline?: string | null; overdue?: boolean }) {
  return <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
    <span className="flex items-center gap-1"><UserRound className="h-3.5 w-3.5" />{memberLabel(member)}</span>
    {deadline && <span className={cn("flex items-center gap-1", overdue && "font-bold text-destructive")}><CalendarDays className="h-3.5 w-3.5" />Due {formatDate(deadline)}</span>}
  </div>;
}

export { AlertTriangle, Clock3 };
