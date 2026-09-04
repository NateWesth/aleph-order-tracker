import { useMemo } from "react";
import { AlarmClock, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDate, isOverdue } from "@/components/admin/workshop/shared";
import SharpeningCommentsPanel from "@/components/admin/workshop/SharpeningCommentsPanel";

export interface FocusJob {
  id: string;
  job_number: string;
  customer_name: string;
  quantity: number;
  date_received: string;
  deadline_date: string | null;
  status: string;
  priority: string;
}

function daysWaiting(date: string) {
  const start = new Date(date);
  if (Number.isNaN(start.getTime())) return 0;
  return Math.max(0, Math.round((Date.now() - start.getTime()) / 86400000));
}

export default function SharpeningFocusHeader({ jobs, onOpenJob, onCreate }: {
  jobs: FocusJob[];
  onOpenJob: (id: string) => void;
  onCreate: () => void;
}) {
  const oldest = useMemo(() => jobs
    .filter((job) => job.status !== "completed")
    .slice()
    .sort((a, b) => (a.date_received || "").localeCompare(b.date_received || ""))
    .slice(0, 3), [jobs]);

  return <header className="grid gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
    <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-logo-magenta/15 text-logo-magenta"><AlarmClock className="h-4 w-4" /></span>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-bold">Waiting the longest</h2>
            <p className="truncate text-[11px] text-muted-foreground">Focus on these sharpening jobs first</p>
          </div>
        </div>
        <Button size="sm" onClick={onCreate} className="h-9 shrink-0 rounded-lg px-3"><Plus className="mr-1.5 h-4 w-4" />New job</Button>
      </div>
      <ul className="divide-y divide-border">
        {oldest.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted-foreground">Nothing outstanding — the queue is clear.</li>}
        {oldest.map((job, index) => {
          const days = daysWaiting(job.date_received);
          return <li key={job.id}>
            <button
              type="button"
              onClick={() => onOpenJob(job.id)}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/50"
            >
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-muted text-[11px] font-bold tabular-nums text-muted-foreground">{index + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold">{job.job_number}</span>
                  {job.priority === "urgent" && <span className="rounded-full bg-logo-magenta px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">urgent</span>}
                  {isOverdue(job.deadline_date, job.status === "completed") && <span className="rounded-full bg-destructive px-1.5 py-0.5 text-[9px] font-bold uppercase text-destructive-foreground">overdue</span>}
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">{job.customer_name} · ×{job.quantity} · in since {formatDate(job.date_received)}</span>
              </span>
              <span className={cn("shrink-0 whitespace-nowrap rounded-full px-2 py-1 text-[11px] font-bold tabular-nums",
                days >= 30 ? "bg-destructive/15 text-destructive" : days >= 14 ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground")}>{days}d</span>
            </button>
          </li>;
        })}
      </ul>
    </section>

    <SharpeningCommentsPanel jobs={jobs} onOpenJob={onOpenJob} />

  </header>;
}
