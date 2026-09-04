import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, CheckCircle2, ClipboardList, Edit3, FileText, Plus, Scissors, Sparkles, UserRound, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import EntityComments from "@/components/admin/EntityComments";
import { cn } from "@/lib/utils";
import { DetailSection, DetailValue, EmptyWorkshop, formatDate, isOverdue, memberLabel, monthLabel, PRIORITIES, PriorityBadge, SERVICE_STATUSES, StatusBadge, TeamMember, WorkshopPanel, WorkshopHeader, WorkshopTabs, WorkshopToolbar } from "@/components/admin/workshop/shared";
import BoardTable, { BoardCell, BoardPriorityCell, BoardStatusCell, GROUP_SPINES, statusTone } from "@/components/admin/workshop/BoardTable";

interface SharpeningJob {
  id: string; date_received: string; job_number: string; customer_name: string; quantity: number;
  priority: string; order_number: string | null; assigned_to: string | null; status: string;
  deadline_date: string | null; invoiced: boolean; invoice_number: string | null;
  third_party_name: string | null; third_party_quantity: number | null; third_party_reference: string | null;
  third_party_status: string | null; notes: string | null; completed_at: string | null; created_at: string;
}

type JobDraft = Omit<SharpeningJob, "id" | "completed_at" | "created_at">;
const STATUS_BUTTON: Record<string, string> = {
  cyan: "border-logo-cyan bg-logo-cyan text-logo-on",
  teal: "border-logo-teal bg-logo-teal text-white",
  violet: "border-logo-violet bg-logo-violet text-white",
  magenta: "border-logo-magenta bg-logo-magenta text-white",
  pink: "border-logo-pink bg-logo-pink text-white",
  ink: "border-logo-ink bg-logo-ink text-white",
  neutral: "border-foreground/20 bg-foreground/85 text-background",
};
const today = () => new Date().toISOString().slice(0, 10);
const emptyDraft = (): JobDraft => ({ date_received: today(), job_number: "", customer_name: "", quantity: 1, priority: "normal", order_number: null, assigned_to: null, status: "not_started", deadline_date: null, invoiced: false, invoice_number: null, third_party_name: null, third_party_quantity: null, third_party_reference: null, third_party_status: null, notes: null });

export default function SharpeningPage() {
  const db = supabase as any;
  const { user } = useAuth();
  const { toast } = useToast();
  const [jobs, setJobs] = useState<SharpeningJob[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"outstanding" | "history">("outstanding");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<SharpeningJob | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<JobDraft>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    const [{ data, error }, { data: profiles }] = await Promise.all([
      db.from("sharpening_jobs").select("*").order("date_received", { ascending: false }),
      supabase.from("profiles").select("id, full_name, email").order("full_name", { ascending: true }),
    ]);
    if (error) toast({ title: "Sharpening jobs could not load", description: error.message, variant: "destructive" });
    else setJobs((data || []) as SharpeningJob[]);
    setTeam((profiles || []) as TeamMember[]);
    setLoading(false);
  }, [db, toast]);

  useEffect(() => {
    void load();
    const channel = supabase.channel("sharpening-workspace-live").on("postgres_changes", { event: "*", schema: "public", table: "sharpening_jobs" }, () => void load(true)).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load]);

  useEffect(() => {
    const openJob = (id: string | null) => { if (!id) return; const job = jobs.find((candidate) => candidate.id === id); if (job) { setSelected(job); window.sessionStorage.removeItem("aleph:open-sharpening"); } };
    openJob(window.sessionStorage.getItem("aleph:open-sharpening"));
    const listener = (event: Event) => openJob(String((event as CustomEvent<string>).detail || ""));
    window.addEventListener("aleph:open-sharpening", listener);
    return () => window.removeEventListener("aleph:open-sharpening", listener);
  }, [jobs]);

  useEffect(() => {
    if (!selected) return;
    const latest = jobs.find((job) => job.id === selected.id);
    if (latest) setSelected(latest);
  }, [jobs, selected?.id]);

  const memberMap = useMemo(() => new Map(team.map((member) => [member.id, member])), [team]);
  const outstanding = jobs.filter((job) => job.status !== "completed");
  const overdueCount = outstanding.filter((job) => isOverdue(job.deadline_date)).length;
  const visible = jobs.filter((job) => (tab === "history" ? job.status === "completed" : job.status !== "completed")).filter((job) => {
    const haystack = `${job.job_number} ${job.customer_name} ${job.order_number || ""} ${job.invoice_number || ""} ${job.third_party_reference || ""}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  }).sort((a, b) => {
    const urgent = Number(b.priority === "urgent") - Number(a.priority === "urgent");
    if (urgent) return urgent;
    return (b.date_received || "").localeCompare(a.date_received || "");
  });
  const monthGroups = useMemo(() => {
    const map = new Map<string, SharpeningJob[]>();
    visible.forEach((job) => {
      const key = (job.date_received || "").slice(0, 7) || "unknown";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(job);
    });
    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, rows], index) => ({
        id: key,
        label: key === "unknown" ? "Date not set" : monthLabel(`${key}-01`),
        rows,
        spine: GROUP_SPINES[index % GROUP_SPINES.length],
      }));
  }, [visible]);

  const openCreate = () => { setEditingId(null); setDraft(emptyDraft()); setFormOpen(true); };
  const openEdit = (job: SharpeningJob) => { setEditingId(job.id); setDraft({ date_received: job.date_received, job_number: job.job_number, customer_name: job.customer_name, quantity: job.quantity, priority: job.priority, order_number: job.order_number, assigned_to: job.assigned_to, status: job.status, deadline_date: job.deadline_date, invoiced: job.invoiced, invoice_number: job.invoice_number, third_party_name: job.third_party_name, third_party_quantity: job.third_party_quantity, third_party_reference: job.third_party_reference, third_party_status: job.third_party_status, notes: job.notes }); setSelected(null); setFormOpen(true); };
  const set = <K extends keyof JobDraft>(key: K, value: JobDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));

  const save = async () => {
    if (!draft.job_number.trim() || !draft.customer_name.trim()) { toast({ title: "Job number and customer are required", variant: "destructive" }); return; }
    setSaving(true);
    const payload = { ...draft, job_number: draft.job_number.trim(), customer_name: draft.customer_name.trim(), order_number: draft.order_number?.trim() || null, invoice_number: draft.invoiced ? draft.invoice_number?.trim() || null : null, third_party_name: draft.third_party_name?.trim() || null, third_party_reference: draft.third_party_reference?.trim() || null, notes: draft.notes?.trim() || null, created_by: user?.id };
    const result = editingId ? await db.from("sharpening_jobs").update(payload).eq("id", editingId) : await db.from("sharpening_jobs").insert(payload);
    setSaving(false);
    if (result.error) { toast({ title: "Job not saved", description: result.error.message, variant: "destructive" }); return; }
    setFormOpen(false); toast({ title: editingId ? "Sharpening job updated" : "Sharpening job added", description: "The workshop queue is live for the whole team." }); await load(true);
  };

  const updateStatus = async (job: SharpeningJob, status: string) => {
    const previous = jobs; setJobs((current) => current.map((row) => row.id === job.id ? { ...row, status } : row));
    const { error } = await db.from("sharpening_jobs").update({ status }).eq("id", job.id);
    if (error) { setJobs(previous); toast({ title: "Status not updated", description: error.message, variant: "destructive" }); }
    else { toast({ title: status === "completed" ? "Moved to sharpening history" : `Status changed to ${SERVICE_STATUSES.find(([id]) => id === status)?.[1]}` }); await load(true); }
  };

  return <div className="workshop-workspace space-y-4 bg-background pb-10 font-sans text-foreground">
    <WorkshopHeader
      eyebrow="Workshop desk"
      title="Sharpening"
      description="A focused, manual queue for every sharpening job — deadlines, ownership, invoicing and third-party work in one place."
      stats={[
        { label: "Outstanding", value: outstanding.length },
        { label: "Overdue", value: overdueCount, tone: overdueCount > 0 ? "danger" : "default" },
        { label: "Urgent", value: outstanding.filter((job) => job.priority === "urgent").length, tone: "warning" },
        { label: "Completed", value: jobs.length - outstanding.length },
      ]}
    >
      <Button onClick={openCreate} className="h-11 rounded-lg px-5"><Plus className="mr-2 h-4 w-4" />New sharpening job</Button>
    </WorkshopHeader>

    <WorkshopToolbar query={query} onQuery={setQuery} placeholder="Search job number, customer, order or invoice…">
      <WorkshopTabs value={tab} onChange={(value) => setTab(value as "outstanding" | "history")} tabs={[
        { id: "outstanding" as const, label: "Outstanding", count: outstanding.length },
        { id: "history" as const, label: "History", count: jobs.length - outstanding.length },
      ]} />
    </WorkshopToolbar>

    {loading ? <div className="space-y-2">{[1,2,3].map((n) => <div key={n} className="h-24 animate-pulse rounded-lg bg-muted/50" />)}</div> : monthGroups.length === 0 ? <EmptyWorkshop history={tab === "history"} /> : <BoardTable
      groups={monthGroups}
      collapsed={collapsed}
      onToggle={(id) => setCollapsed((current) => ({ ...current, [id]: !current[id] }))}
      rowKey={(job) => job.id}
      onRowClick={(job) => setSelected(job)}
      activeKey={selected?.id}
      noun="job"
      columns={[
        { key: "job", label: "Job", cell: (job) => <span className="whitespace-nowrap px-1 font-semibold">{job.job_number}</span> },
        { key: "received", label: "Received date", align: "center", cell: (job) => <span className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(job.date_received)}</span> },
        { key: "customer", label: "Customer", cell: (job) => <span className="px-1">{job.customer_name}</span> },
        { key: "qty", label: "Qty", align: "center", width: "64px", cell: (job) => <span className="tabular-nums">{job.quantity}</span>, summary: (rows) => <span>{rows.reduce((sum, row) => sum + (row.quantity || 0), 0)} sum</span> },
        { key: "priority", label: "Priority", align: "center", width: "104px", cell: (job) => <BoardPriorityCell priority={job.priority} /> },
        { key: "order", label: "Order no", align: "center", cell: (job) => <span className="text-xs text-muted-foreground">{job.order_number || "—"}</span> },
        { key: "assigned", label: "Assigned", align: "center", width: "140px", cell: (job) => job.assigned_to ? <BoardCell tone="violet">{memberLabel(memberMap.get(job.assigned_to))}</BoardCell> : <span className="text-xs text-muted-foreground">Unassigned</span> },
        { key: "status", label: "Status", align: "center", width: "170px", cell: (job) => <BoardStatusCell status={job.status} /> },
        { key: "deadline", label: "Deadline", align: "center", width: "130px", cell: (job) => job.deadline_date ? <span className={cn("whitespace-nowrap text-xs font-semibold", isOverdue(job.deadline_date, job.status === "completed") ? "text-destructive" : "text-muted-foreground")}>{formatDate(job.deadline_date)}</span> : <span className="text-xs text-muted-foreground">—</span> },
        { key: "invoice", label: "Invoice", align: "center", width: "110px", cell: (job) => job.invoiced ? <BoardCell tone="cyan">Done</BoardCell> : <span className="text-xs text-muted-foreground">—</span> },
        { key: "third", label: "Third party", align: "center", cell: (job) => <span className="text-xs text-muted-foreground">{job.third_party_name || "—"}</span> },
      ]}
    />}



    <Dialog open={formOpen} onOpenChange={setFormOpen}><DialogContent className="max-h-[92dvh] w-[calc(100%-20px)] max-w-3xl overflow-y-auto rounded-[28px] p-0"><div className="border-b border-border/60 bg-primary/[0.06] p-5 sm:p-6"><DialogHeader><DialogTitle className="flex items-center gap-2 text-2xl font-black"><span className="grid h-10 w-10 place-items-center rounded-2xl bg-primary text-primary-foreground"><Scissors className="h-5 w-5" /></span>{editingId ? "Edit sharpening job" : "New sharpening job"}</DialogTitle></DialogHeader><p className="mt-2 text-sm text-muted-foreground">Manual workshop record—no external API calls are made.</p></div><div className="space-y-6 p-5 sm:p-6">
      <FormSection title="Job intake"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><Field label="Date received"><Input type="date" value={draft.date_received} onChange={(e) => set("date_received", e.target.value)} /></Field><Field label="Job number *"><Input value={draft.job_number} onChange={(e) => set("job_number", e.target.value)} placeholder="SH-1042" /></Field><Field label="Order number"><Input value={draft.order_number || ""} onChange={(e) => set("order_number", e.target.value || null)} placeholder="Optional" /></Field><Field label="Customer name *" wide><Input value={draft.customer_name} onChange={(e) => set("customer_name", e.target.value)} /></Field><Field label="Quantity"><Input type="number" min={1} value={draft.quantity} onChange={(e) => set("quantity", Math.max(1, Number(e.target.value)))} /></Field></div></FormSection>
      <FormSection title="Workflow"><div className="grid gap-4 sm:grid-cols-2"><Field label="Status"><StatusSelect value={draft.status} onChange={(value) => set("status", value)} /></Field><Field label="Priority"><Select value={draft.priority} onValueChange={(value) => set("priority", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PRIORITIES.map(([value,label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></Field><Field label="Assigned to"><TeamSelect value={draft.assigned_to} team={team} onChange={(value) => set("assigned_to", value)} /></Field><Field label="Deadline (optional)"><Input type="date" value={draft.deadline_date || ""} onChange={(e) => set("deadline_date", e.target.value || null)} /></Field></div></FormSection>
      <FormSection title="Invoice"><div className="grid gap-4 sm:grid-cols-2"><label className="flex min-h-11 items-center gap-3 rounded-xl border border-border/60 bg-muted/20 px-3 text-sm font-semibold"><input type="checkbox" checked={draft.invoiced} onChange={(e) => set("invoiced", e.target.checked)} className="h-4 w-4 accent-primary" />Invoice completed</label>{draft.invoiced && <Field label="Invoice number"><Input value={draft.invoice_number || ""} onChange={(e) => set("invoice_number", e.target.value || null)} /></Field>}</div></FormSection>
      <FormSection title="Third-party work" description="Leave blank when everything is handled internally."><div className="grid gap-4 sm:grid-cols-2"><Field label="Repairer / supplier"><Input value={draft.third_party_name || ""} onChange={(e) => set("third_party_name", e.target.value || null)} /></Field><Field label="Quantity"><Input type="number" min={0} value={draft.third_party_quantity ?? ""} onChange={(e) => set("third_party_quantity", e.target.value ? Number(e.target.value) : null)} /></Field><Field label="Reference"><Input value={draft.third_party_reference || ""} onChange={(e) => set("third_party_reference", e.target.value || null)} /></Field><Field label="Third-party status"><StatusSelect value={draft.third_party_status || "none"} allowNone onChange={(value) => set("third_party_status", value === "none" ? null : value)} /></Field></div></FormSection>
      <Field label="Notes"><Textarea value={draft.notes || ""} onChange={(e) => set("notes", e.target.value || null)} className="min-h-24 resize-none" placeholder="Condition, special instructions, quote details…" /></Field><div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end"><Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button><Button onClick={() => void save()} disabled={saving}>{saving ? "Saving…" : editingId ? "Save changes" : "Add to queue"}</Button></div>
    </div></DialogContent></Dialog>

    <WorkshopPanel
      open={!!selected}
      onOpenChange={(open) => !open && setSelected(null)}
      icon={<Scissors className="h-5 w-5" />}
      reference={selected ? `Job ${selected.job_number}` : ""}
      title={selected?.customer_name || ""}
      subtitle={selected ? <>×{selected.quantity} · Received {formatDate(selected.date_received)}</> : null}
      badges={selected ? <><StatusBadge status={selected.status} /><PriorityBadge priority={selected.priority} /></> : null}
      actions={selected ? <><Button variant="outline" className="sm:min-w-36" onClick={() => openEdit(selected)}><Edit3 className="mr-2 h-4 w-4" />Edit details</Button>{selected.status !== "completed" && <Button className="sm:min-w-40" onClick={() => void updateStatus(selected, "completed")}><CheckCircle2 className="mr-2 h-4 w-4" />Complete & archive</Button>}</> : null}
    >
      {selected && <>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3"><DetailValue label="Received" value={formatDate(selected.date_received)} icon={<CalendarClock className="h-3.5 w-3.5" />} /><DetailValue label="Quantity" value={`×${selected.quantity}`} /><DetailValue label="Order" value={selected.order_number} /><DetailValue label="Assigned to" value={memberLabel(selected.assigned_to ? memberMap.get(selected.assigned_to) : null)} icon={<UserRound className="h-3.5 w-3.5" />} /><DetailValue label="Deadline" value={formatDate(selected.deadline_date)} /><DetailValue label="Invoice" value={selected.invoiced ? selected.invoice_number || "Completed" : "Not invoiced"} icon={<FileText className="h-3.5 w-3.5" />} /></div>
      <DetailSection title="Move the job forward"><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{SERVICE_STATUSES.map(([value,label]) => <button key={value} onClick={() => void updateStatus(selected, value)} className={cn("rounded-xl border px-3 py-2 text-xs font-semibold transition", selected.status === value ? STATUS_BUTTON[statusTone(value)] : "border-border bg-card text-muted-foreground hover:border-logo-cyan/40 hover:bg-accent/40 hover:text-foreground")}>{label}</button>)}</div></DetailSection>
      {(selected.third_party_name || selected.third_party_reference) && <DetailSection title="Third-party work"><div className="grid gap-2.5 sm:grid-cols-2"><DetailValue label="Repairer / supplier" value={selected.third_party_name} /><DetailValue label="Reference" value={selected.third_party_reference} /><DetailValue label="Quantity" value={selected.third_party_quantity} /><DetailValue label="Status" value={selected.third_party_status ? <StatusBadge status={selected.third_party_status} /> : null} /></div></DetailSection>}
      {selected.notes && <DetailValue label="Workshop notes" value={<p className="whitespace-pre-wrap font-normal leading-6">{selected.notes}</p>} icon={<ClipboardList className="h-3.5 w-3.5" />} />}
      <EntityComments entityType="sharpening" entityId={selected.id} defaultOpen />
      </>}
    </WorkshopPanel>

  </div>;
}

function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) { return <div className={cn(wide && "sm:col-span-2")}><Label className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-muted-foreground">{label}</Label>{children}</div>; }
function FormSection({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) { return <section><div className="mb-3"><h3 className="text-sm font-black">{title}</h3>{description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}</div>{children}</section>; }
function StatusSelect({ value, onChange, allowNone = false }: { value: string; onChange: (value: string) => void; allowNone?: boolean }) { return <Select value={value} onValueChange={onChange}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{allowNone && <SelectItem value="none">Not applicable</SelectItem>}{SERVICE_STATUSES.map(([id,label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}</SelectContent></Select>; }
function TeamSelect({ value, team, onChange }: { value: string | null; team: TeamMember[]; onChange: (value: string | null) => void }) { return <Select value={value || "unassigned"} onValueChange={(next) => onChange(next === "unassigned" ? null : next)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unassigned">Unassigned</SelectItem>{team.map((member) => <SelectItem key={member.id} value={member.id}>{memberLabel(member)}</SelectItem>)}</SelectContent></Select>; }
