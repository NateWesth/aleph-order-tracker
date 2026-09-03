import type { ReactNode } from "react";
import { AlertTriangle, CalendarDays, CheckCircle2, Clock3, Search, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  return <Badge variant="outline" className={cn("rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide", tone)}>{statusLabel(status)}</Badge>;
}

export function PriorityBadge({ priority }: { priority: string }) {
  if (priority === "normal" || priority === "low") return null;
  return <Badge className={cn("rounded-full text-[10px] uppercase", priority === "urgent" ? "bg-red-600 text-white" : "bg-orange-500 text-white")}>{priority}</Badge>;
}

export function WorkshopHero({ eyebrow, title, description, count, overdue, children }: { eyebrow: string; title: string; description: string; count: number; overdue: number; children: ReactNode }) {
  return <section className="relative overflow-hidden rounded-[28px] border border-primary/15 bg-gradient-to-br from-primary/[0.12] via-background to-amber-500/[0.08] p-5 shadow-sm sm:p-7">
    <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
    <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
      <div className="max-w-2xl"><p className="text-[10px] font-black uppercase tracking-[0.22em] text-primary">{eyebrow}</p><h1 className="mt-2 text-3xl font-black tracking-[-0.035em] sm:text-4xl">{title}</h1><p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{description}</p>
        <div className="mt-4 flex flex-wrap gap-2"><Badge variant="secondary" className="rounded-full"><Clock3 className="mr-1.5 h-3.5 w-3.5" />{count} outstanding</Badge>{overdue > 0 && <Badge variant="destructive" className="rounded-full"><AlertTriangle className="mr-1.5 h-3.5 w-3.5" />{overdue} overdue</Badge>}</div>
      </div>{children}
    </div>
  </section>;
}

export function WorkshopToolbar({ query, onQuery, children }: { query: string; onQuery: (value: string) => void; children: ReactNode }) {
  return <div className="sticky top-0 z-20 -mx-2 flex flex-col gap-3 border-b border-border/45 bg-background/90 px-2 py-3 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
    <div className="relative min-w-0 flex-1 sm:max-w-md"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Search reference, customer or tool…" className="h-11 rounded-2xl bg-muted/35 pl-9" /></div>{children}
  </div>;
}

export function EmptyWorkshop({ history = false }: { history?: boolean }) {
  return <div className="rounded-[26px] border border-dashed border-border/70 bg-muted/15 px-5 py-14 text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-emerald-500/10 text-emerald-600"><CheckCircle2 className="h-6 w-6" /></span><h3 className="mt-4 font-black">{history ? "No matching history" : "Workshop queue is clear"}</h3><p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{history ? "Completed work remains safely searchable here." : "New manual work will appear here as soon as a team member adds it."}</p></div>;
}

export function DetailValue({ label, value, icon }: { label: string; value?: ReactNode; icon?: ReactNode }) {
  return <div className="rounded-2xl border border-border/50 bg-muted/25 p-3.5"><p className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.15em] text-muted-foreground">{icon}{label}</p><div className="mt-1.5 break-words text-sm font-semibold text-foreground">{value || "—"}</div></div>;
}

export function AssignmentLine({ member, deadline, overdue }: { member?: TeamMember | null; deadline?: string | null; overdue?: boolean }) {
  return <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground"><span className="flex items-center gap-1"><UserRound className="h-3.5 w-3.5" />{memberLabel(member)}</span>{deadline && <span className={cn("flex items-center gap-1", overdue && "font-bold text-destructive")}><CalendarDays className="h-3.5 w-3.5" />Due {formatDate(deadline)}</span>}</div>;
}
