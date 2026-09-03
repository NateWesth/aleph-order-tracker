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

export function StatusBadge({ status }: { status: string }) {
  const tone = status === "completed" ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
    : status === "working_on_it" ? "border-blue-500/25 bg-blue-500/10 text-blue-700 dark:text-blue-300"
    : status === "awaiting_quote_approval" ? "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300"
    : status === "next" ? "border-primary/25 bg-primary/10 text-primary" : "border-border/60 bg-muted/60 text-muted-foreground";
  return <Badge variant="outline" className={cn("rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide", tone)}>{statusLabel(status)}</Badge>;
}

export function PriorityBadge({ priority }: { priority: string }) {
  if (priority === "normal" || priority === "low") return null;
  return <Badge className={cn("rounded-md px-2 py-0.5 text-[10px] font-bold uppercase", priority === "urgent" ? "bg-destructive text-destructive-foreground" : "bg-amber-500 text-background")}>{priority}</Badge>;
}

/** Compact, editorial page header — no gradients, no glass. */
export function WorkshopHeader({ eyebrow, title, description, stats, children }: {
  eyebrow: string; title: string; description: string;
  stats: { label: string; value: ReactNode; tone?: "default" | "warning" | "danger" }[];
  children?: ReactNode;
}) {
  return <header className="rounded-2xl border border-border bg-card">
    <div className="flex flex-col gap-4 border-b border-border p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">{eyebrow}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
    <dl className="grid grid-cols-2 divide-x divide-border sm:grid-cols-4">
      {stats.map((stat) => <div key={stat.label} className="px-4 py-3">
        <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{stat.label}</dt>
        <dd className={cn("mt-0.5 text-xl font-bold tabular-nums",
          stat.tone === "danger" && "text-destructive",
          stat.tone === "warning" && "text-amber-600 dark:text-amber-400")}>{stat.value}</dd>
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
  return <div className="sticky top-0 z-20 -mx-2 flex flex-col gap-2 border-b border-border bg-background px-2 py-2.5 sm:flex-row sm:items-center sm:justify-between">
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
  return Array.from(map.entries())
    .sort((a, b) => statusRank(a[0]) - statusRank(b[0]))
    .map(([status, group]) => [status, group.sort((a, b) => getDate(b).localeCompare(getDate(a)))] as [string, T[]]);
}

export function StatusGroup({ status, count, children }: { status: string; count: number; children: ReactNode }) {
  return <section className="overflow-hidden rounded-xl border border-border bg-card">
    <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-2">
      <StatusBadge status={status} />
      <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">{count}</span>
      <span className="ml-auto text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Newest first</span>
    </div>
    <div className="divide-y divide-border">{children}</div>
  </section>;
}

/** Single compact list row (table-like on desktop). */
export function WorkshopRow({ reference, primary, secondary, date, dateLabel, assignee, deadline, overdue, tags, active, muted, onClick }: {
  reference: string; primary: ReactNode; secondary?: ReactNode; date: string; dateLabel?: string;
  assignee?: string; deadline?: string | null; overdue?: boolean; tags?: ReactNode;
  active?: boolean; muted?: boolean; onClick: () => void;
}) {
  return <button type="button" onClick={onClick}
    className={cn("grid w-full grid-cols-[1fr_auto] gap-x-3 gap-y-1 px-3 py-2.5 text-left transition hover:bg-accent/40 sm:grid-cols-[minmax(0,7rem)_minmax(0,2fr)_minmax(0,1fr)_minmax(0,9rem)_minmax(0,8rem)] sm:items-center",
      active && "bg-accent/60", muted && "text-muted-foreground")}>
    <span className="font-mono text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{reference}</span>
    <span className="min-w-0 truncate text-sm font-semibold text-foreground">{primary}{secondary && <span className="ml-2 font-normal text-muted-foreground">{secondary}</span>}</span>
    <span className="col-span-2 flex flex-wrap items-center gap-1 sm:col-span-1 sm:justify-start">{tags}</span>
    <span className="hidden truncate text-xs text-muted-foreground sm:block">{assignee || "Unassigned"}</span>
    <span className={cn("text-right text-[11px] tabular-nums text-muted-foreground sm:text-left", overdue && "font-bold text-destructive")}>
      {deadline ? `Due ${formatDate(deadline)}` : `${dateLabel || "Received"} ${formatDate(date)}`}
    </span>
  </button>;
}

export function ListHeadings({ columns }: { columns: string[] }) {
  return <div className="hidden grid-cols-[minmax(0,7rem)_minmax(0,2fr)_minmax(0,1fr)_minmax(0,9rem)_minmax(0,8rem)] gap-3 px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground sm:grid">
    {columns.map((column) => <span key={column}>{column}</span>)}
  </div>;
}

export function EmptyWorkshop({ history = false }: { history?: boolean }) {
  return <div className="rounded-xl border border-dashed border-border bg-card px-5 py-14 text-center">
    <span className="mx-auto grid h-11 w-11 place-items-center rounded-lg bg-emerald-500/10 text-emerald-600"><CheckCircle2 className="h-5 w-5" /></span>
    <h3 className="mt-3 font-bold">{history ? "No matching history" : "Workshop queue is clear"}</h3>
    <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{history ? "Completed work remains safely searchable here." : "New manual work will appear here as soon as a team member adds it."}</p>
  </div>;
}

/** Right-hand side panel used for workshop detail — no floating bubble. */
export function WorkshopPanel({ open, onOpenChange, icon, reference, title, subtitle, badges, overlay, children, actions }: {
  open: boolean; onOpenChange: (open: boolean) => void;
  icon: ReactNode; reference: string; title: string; subtitle?: ReactNode; badges?: ReactNode; overlay?: ReactNode;
  children: ReactNode; actions?: ReactNode;
}) {
  return <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent side="right" className="flex w-full flex-col gap-0 border-l border-border bg-background p-0 sm:max-w-xl">
      {overlay}
      <SheetHeader className="space-y-0 border-b border-border bg-muted/40 px-5 py-4 text-left">
        <div className="flex items-start gap-3 pr-8">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-border bg-card text-primary">{icon}</span>
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{reference}</p>
            <SheetTitle className="truncate text-xl font-bold tracking-tight">{title}</SheetTitle>
            {subtitle && <div className="mt-0.5 truncate text-sm text-muted-foreground">{subtitle}</div>}
            {badges && <div className="mt-2 flex flex-wrap gap-1.5">{badges}</div>}
          </div>
        </div>
      </SheetHeader>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">{children}</div>
      {actions && <div className="flex flex-col gap-2 border-t border-border bg-muted/40 p-4 sm:flex-row sm:justify-end">{actions}</div>}
    </SheetContent>
  </Sheet>;
}

export function DetailSection({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return <section className={cn("rounded-xl border border-border bg-background p-4", className)}>
    <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{title}</p>
    {children}
  </section>;
}

export function DetailValue({ label, value, icon }: { label: string; value?: ReactNode; icon?: ReactNode }) {
  return <div className="rounded-lg border border-border bg-background p-3">
    <p className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.15em] text-muted-foreground">{icon}{label}</p>
    <div className="mt-1 break-words text-sm font-semibold text-foreground">{value || "—"}</div>
  </div>;
}

export function AssignmentLine({ member, deadline, overdue }: { member?: TeamMember | null; deadline?: string | null; overdue?: boolean }) {
  return <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
    <span className="flex items-center gap-1"><UserRound className="h-3.5 w-3.5" />{memberLabel(member)}</span>
    {deadline && <span className={cn("flex items-center gap-1", overdue && "font-bold text-destructive")}><CalendarDays className="h-3.5 w-3.5" />Due {formatDate(deadline)}</span>}
  </div>;
}

export { AlertTriangle, Clock3 };
