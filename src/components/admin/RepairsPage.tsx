import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, Edit3, Hammer, History, PackageOpen, Plus, ShieldCheck, Ticket, Trash2, UserRound, Wrench } from "lucide-react";
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
import { AssignmentLine, DetailSection, DetailValue, EmptyWorkshop, formatDate, isOverdue, memberLabel, monthLabel, MonthDivider, PRIORITIES, PriorityBadge, SERVICE_STATUSES, StatusBadge, TeamMember, WorkshopCard, WorkshopDetail, WorkshopHeader, WorkshopTabs, WorkshopToolbar } from "@/components/admin/workshop/shared";

interface RepairTicket {
  id: string; ticket_number: string; client: string; tool_code: string; tool_information: string;
  date_received_by_client: string; supplier_information: string | null; customer_information: string | null;
  assigned_to: string | null; priority: string; status: string; deadline_date: string | null;
  date_received_back_from_supplier: string | null; warranty_months: number | null; warranty_expires_at: string | null;
  is_warranty: boolean; warranty_source_ticket_id: string | null; invoiced: boolean; invoice_number: string | null;
  notes: string | null; scrap_reason: string | null; scrapped_at: string | null; completed_at: string | null; created_at: string;
}
type RepairDraft = Omit<RepairTicket, "id" | "warranty_expires_at" | "is_warranty" | "warranty_source_ticket_id" | "scrapped_at" | "completed_at" | "created_at" | "scrap_reason">;
const today = () => new Date().toISOString().slice(0, 10);
const emptyDraft = (): RepairDraft => ({ ticket_number: "", client: "", tool_code: "", tool_information: "", date_received_by_client: today(), supplier_information: null, customer_information: null, assigned_to: null, priority: "normal", status: "not_started", deadline_date: null, date_received_back_from_supplier: null, warranty_months: null, invoiced: false, invoice_number: null, notes: null });

export default function RepairsPage() {
  const db = supabase as any;
  const { user } = useAuth(); const { toast } = useToast();
  const [tickets, setTickets] = useState<RepairTicket[]>([]); const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true); const [tab, setTab] = useState<"outstanding" | "warranty" | "history">("outstanding");
  const [query, setQuery] = useState(""); const [selected, setSelected] = useState<RepairTicket | null>(null);
  const [formOpen, setFormOpen] = useState(false); const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<RepairDraft>(emptyDraft); const [saving, setSaving] = useState(false);
  const [scrapOpen, setScrapOpen] = useState(false); const [scrapReason, setScrapReason] = useState("");

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    const [{ data, error }, { data: profiles }] = await Promise.all([
      db.from("repair_tickets").select("*").order("date_received_by_client", { ascending: false }),
      supabase.from("profiles").select("id, full_name, email").order("full_name", { ascending: true }),
    ]);
    if (error) toast({ title: "Repair tickets could not load", description: error.message, variant: "destructive" }); else setTickets((data || []) as RepairTicket[]);
    setTeam((profiles || []) as TeamMember[]); setLoading(false);
  }, [db, toast]);
  useEffect(() => { void load(); const channel = supabase.channel("repair-workspace-live").on("postgres_changes", { event: "*", schema: "public", table: "repair_tickets" }, () => void load(true)).subscribe(); return () => { void supabase.removeChannel(channel); }; }, [load]);
  useEffect(() => { const openTicket=(id:string|null)=>{if(!id)return;const ticket=tickets.find(candidate=>candidate.id===id);if(ticket){setSelected(ticket);window.sessionStorage.removeItem("aleph:open-repairs");}};openTicket(window.sessionStorage.getItem("aleph:open-repairs"));const listener=(event:Event)=>openTicket(String((event as CustomEvent<string>).detail||""));window.addEventListener("aleph:open-repairs",listener);return()=>window.removeEventListener("aleph:open-repairs",listener);},[tickets]);
  useEffect(() => { if (!selected) return; const latest = tickets.find((ticket) => ticket.id === selected.id); if (latest) setSelected(latest); }, [tickets, selected?.id]);

  const memberMap = useMemo(() => new Map(team.map((member) => [member.id, member])), [team]);
  const active = tickets.filter((ticket) => !["completed", "scrapped"].includes(ticket.status));
  const warrantyActive = active.filter((ticket) => ticket.is_warranty); const normalActive = active.filter((ticket) => !ticket.is_warranty);
  const history = tickets.filter((ticket) => ["completed", "scrapped"].includes(ticket.status));
  const overdueCount = active.filter((ticket) => isOverdue(ticket.deadline_date)).length;
  const base = tab === "history" ? history : tab === "warranty" ? warrantyActive : normalActive;
  const visible = base.filter((ticket) => `${ticket.ticket_number} ${ticket.client} ${ticket.tool_code} ${ticket.tool_information} ${ticket.supplier_information || ""}`.toLowerCase().includes(query.trim().toLowerCase())).sort((a,b) => Number(b.priority === "urgent") - Number(a.priority === "urgent") || b.date_received_by_client.localeCompare(a.date_received_by_client));
  const groups = useMemo(() => Object.entries(visible.reduce<Record<string,RepairTicket[]>>((acc,ticket) => { const key = monthLabel(ticket.date_received_by_client); (acc[key] ||= []).push(ticket); return acc; }, {})), [visible]);

  const warrantyMatch = useMemo(() => {
    const code = draft.tool_code.trim().toLowerCase(); if (!code) return null;
    const received = new Date(`${draft.date_received_by_client}T12:00:00`).getTime();
    return tickets.filter((ticket) => ticket.id !== editingId && ticket.tool_code.trim().toLowerCase() === code && !!ticket.warranty_expires_at && !!ticket.date_received_back_from_supplier && ["completed", "scrapped"].includes(ticket.status)).filter((ticket) => new Date(`${ticket.date_received_back_from_supplier}T12:00:00`).getTime() <= received && new Date(`${ticket.warranty_expires_at}T23:59:59`).getTime() >= received).sort((a,b) => (b.warranty_expires_at || "").localeCompare(a.warranty_expires_at || ""))[0] || null;
  }, [draft.tool_code, draft.date_received_by_client, editingId, tickets]);

  const set = <K extends keyof RepairDraft>(key: K, value: RepairDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const openCreate = () => { setEditingId(null); setDraft(emptyDraft()); setFormOpen(true); };
  const openEdit = (ticket: RepairTicket) => { setEditingId(ticket.id); setDraft({ ticket_number: ticket.ticket_number, client: ticket.client, tool_code: ticket.tool_code, tool_information: ticket.tool_information, date_received_by_client: ticket.date_received_by_client, supplier_information: ticket.supplier_information, customer_information: ticket.customer_information, assigned_to: ticket.assigned_to, priority: ticket.priority, status: ticket.status === "scrapped" ? "not_started" : ticket.status, deadline_date: ticket.deadline_date, date_received_back_from_supplier: ticket.date_received_back_from_supplier, warranty_months: ticket.warranty_months, invoiced: ticket.invoiced, invoice_number: ticket.invoice_number, notes: ticket.notes }); setSelected(null); setFormOpen(true); };
  const save = async () => {
    if (!draft.ticket_number.trim() || !draft.client.trim() || !draft.tool_code.trim() || !draft.tool_information.trim()) { toast({ title: "Ticket, client, tool code and tool details are required", variant: "destructive" }); return; }
    setSaving(true); const payload = { ...draft, ticket_number: draft.ticket_number.trim(), client: draft.client.trim(), tool_code: draft.tool_code.trim().toUpperCase(), tool_information: draft.tool_information.trim(), supplier_information: draft.supplier_information?.trim() || null, customer_information: draft.customer_information?.trim() || null, invoice_number: draft.invoiced ? draft.invoice_number?.trim() || null : null, notes: draft.notes?.trim() || null, created_by: user?.id };
    const result = editingId ? await db.from("repair_tickets").update(payload).eq("id", editingId) : await db.from("repair_tickets").insert(payload); setSaving(false);
    if (result.error) { toast({ title: "Repair not saved", description: result.error.message, variant: "destructive" }); return; }
    setFormOpen(false); toast({ title: editingId ? "Repair updated" : warrantyMatch ? "Warranty repair created" : "Repair added", description: warrantyMatch ? `Matched to ${warrantyMatch.ticket_number}; routed to Warranty Repairs.` : "The live repair queue is updated for everyone." }); await load(true);
  };
  const updateStatus = async (ticket: RepairTicket, status: string) => { const previous=tickets; setTickets((current)=>current.map((row)=>row.id===ticket.id?{...row,status}:row)); const {error}=await db.from("repair_tickets").update({status}).eq("id",ticket.id); if(error){setTickets(previous);toast({title:"Status not updated",description:error.message,variant:"destructive"});}else{toast({title:status==="completed"?"Moved to repair history":"Repair status updated"});await load(true);} };
  const scrap = async () => { if (!selected) return; setSaving(true); const {error}=await db.from("repair_tickets").update({status:"scrapped",scrap_reason:scrapReason.trim()||null,scrapped_by:user?.id}).eq("id",selected.id); setSaving(false); if(error){toast({title:"Repair not scrapped",description:error.message,variant:"destructive"});return;} setScrapOpen(false);setScrapReason("");toast({title:"Tool marked as scrapped",description:"The ticket is retained permanently in Repair History."});await load(true); };

  return <div className="space-y-4 pb-10">
    <WorkshopHeader
      eyebrow="After-sales workshop"
      title="Repairs"
      description="Track every tool from intake to supplier return. Repeat tool codes are automatically checked against completed warranty periods."
      stats={[
        { label: "Outstanding", value: normalActive.length },
        { label: "Warranty", value: warrantyActive.length },
        { label: "Overdue", value: overdueCount, tone: overdueCount > 0 ? "danger" : "default" },
        { label: "History", value: history.length },
      ]}
    >
      <Button onClick={openCreate} className="h-11 rounded-lg px-5"><Plus className="mr-2 h-4 w-4" />New repair ticket</Button>
    </WorkshopHeader>

    <WorkshopToolbar query={query} onQuery={setQuery} placeholder="Search ticket, client, tool code or invoice…">
      <WorkshopTabs value={tab} onChange={(value) => setTab(value as "outstanding" | "warranty" | "history")} tabs={[
        { id: "outstanding" as const, label: "Repairs", count: normalActive.length },
        { id: "warranty" as const, label: "Warranty", count: warrantyActive.length },
        { id: "history" as const, label: "History", count: history.length },
      ]} />
    </WorkshopToolbar>

    {loading ? <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">{[1,2,3,4,5,6].map(n => <div key={n} className="h-36 animate-pulse rounded-xl bg-muted/50" />)}</div> : groups.length === 0 ? <EmptyWorkshop history={tab === "history"} /> : <div className="space-y-5">{groups.map(([month, monthTickets]) => <section key={month}>
      <MonthDivider label={month} count={monthTickets.length} noun="ticket" />
      <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">{monthTickets.map(ticket => {
        const overdue = isOverdue(ticket.deadline_date, ["completed","scrapped"].includes(ticket.status));
        return <WorkshopCard
          key={ticket.id}
          onClick={() => setSelected(ticket)}
          reference={`Ticket ${ticket.ticket_number}`}
          title={ticket.client}
          subtitle={<span className="font-mono uppercase text-primary">{ticket.tool_code}</span>}
          accent={ticket.status === "scrapped" ? "scrapped" : ticket.is_warranty ? "warranty" : ticket.priority === "urgent" || overdue ? "urgent" : ticket.status === "completed" ? "done" : "default"}
          muted={["completed","scrapped"].includes(ticket.status)}
          badges={<><PriorityBadge priority={ticket.priority} />{ticket.is_warranty && <Badge className="rounded-md bg-emerald-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white"><ShieldCheck className="mr-1 h-3 w-3" />Warranty</Badge>}{ticket.status === "scrapped" && <Badge variant="destructive" className="rounded-md px-2 py-0.5 text-[10px] font-bold uppercase">Scrapped</Badge>}</>}
          aside={<><p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{ticket.tool_information}</p><div className="mt-2.5"><StatusBadge status={ticket.status} /></div><AssignmentLine member={ticket.assigned_to ? memberMap.get(ticket.assigned_to) : null} deadline={ticket.deadline_date} overdue={overdue} /></>}
          meta={<><span>Received {formatDate(ticket.date_received_by_client)}</span><span className="font-semibold text-primary opacity-0 transition group-hover:opacity-100">Open →</span></>}
        />;
      })}</div>
    </section>)}</div>}

    <Dialog open={formOpen} onOpenChange={setFormOpen}><DialogContent className="max-h-[92dvh] w-[calc(100%-20px)] max-w-3xl overflow-y-auto rounded-[28px] p-0"><div className="border-b border-border/60 bg-primary/[.06] p-5 sm:p-6"><DialogHeader><DialogTitle className="flex items-center gap-2 text-2xl font-black"><span className="grid h-10 w-10 place-items-center rounded-2xl bg-primary text-primary-foreground"><Wrench className="h-5 w-5"/></span>{editingId?"Edit repair ticket":"New repair ticket"}</DialogTitle></DialogHeader><p className="mt-2 text-sm text-muted-foreground">Tool code is the warranty key. Use the same code every time a tool returns.</p></div><div className="space-y-6 p-5 sm:p-6">
      <FormSection title="Ticket & tool"><div className="grid gap-4 sm:grid-cols-2"><Field label="Ticket number *"><Input value={draft.ticket_number} onChange={e=>set("ticket_number",e.target.value)} placeholder="REP-2048"/></Field><Field label="Date received by client *"><Input type="date" value={draft.date_received_by_client} onChange={e=>set("date_received_by_client",e.target.value)}/></Field><Field label="Client *"><Input value={draft.client} onChange={e=>set("client",e.target.value)}/></Field><Field label="Tool code / serial *"><Input value={draft.tool_code} onChange={e=>set("tool_code",e.target.value)} placeholder="Unique code used for warranty matching" className="uppercase"/></Field><Field label="Tool information *" wide><Textarea value={draft.tool_information} onChange={e=>set("tool_information",e.target.value)} className="min-h-20" placeholder="Make, model, serial, fault and accessories received…"/></Field></div>{warrantyMatch&&<div className="mt-4 flex gap-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4 text-emerald-800 dark:text-emerald-200"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0"/><div><p className="text-sm font-black">Warranty automatically detected</p><p className="mt-0.5 text-xs">Tool code matches {warrantyMatch.ticket_number}. Coverage runs until {formatDate(warrantyMatch.warranty_expires_at)}; this ticket will enter Warranty Repairs.</p></div></div>}</FormSection>
      <FormSection title="Repair workflow"><div className="grid gap-4 sm:grid-cols-2"><Field label="Status"><StatusSelect value={draft.status} onChange={value=>set("status",value)}/></Field><Field label="Priority"><Select value={draft.priority} onValueChange={value=>set("priority",value)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{PRIORITIES.map(([id,label])=><SelectItem key={id} value={id}>{label}</SelectItem>)}</SelectContent></Select></Field><Field label="Assigned to"><TeamSelect value={draft.assigned_to} team={team} onChange={value=>set("assigned_to",value)}/></Field><Field label="Deadline"><Input type="date" value={draft.deadline_date||""} onChange={e=>set("deadline_date",e.target.value||null)}/></Field></div></FormSection>
      <FormSection title="People & supplier"><div className="grid gap-4 sm:grid-cols-2"><Field label="Supplier information"><Textarea value={draft.supplier_information||""} onChange={e=>set("supplier_information",e.target.value||null)} className="min-h-24" placeholder="Supplier, contact and reference details…"/></Field><Field label="Customer information"><Textarea value={draft.customer_information||""} onChange={e=>set("customer_information",e.target.value||null)} className="min-h-24" placeholder="Contact person, phone, instructions…"/></Field></div></FormSection>
      <FormSection title="Supplier return & warranty" description="Coverage starts on the supplier-return date—not the ticket creation date."><div className="grid gap-4 sm:grid-cols-2"><Field label="Received back from supplier"><Input type="date" value={draft.date_received_back_from_supplier||""} onChange={e=>set("date_received_back_from_supplier",e.target.value||null)}/></Field>{draft.date_received_back_from_supplier&&<Field label="Warranty length (months)"><Input type="number" min={0} max={120} value={draft.warranty_months??""} onChange={e=>set("warranty_months",e.target.value?Number(e.target.value):null)} placeholder="e.g. 6"/></Field>}</div></FormSection>
      <FormSection title="Invoice & notes"><div className="grid gap-4 sm:grid-cols-2"><label className="flex min-h-11 items-center gap-3 rounded-xl border border-border/60 bg-muted/20 px-3 text-sm font-semibold"><input type="checkbox" checked={draft.invoiced} onChange={e=>set("invoiced",e.target.checked)} className="h-4 w-4 accent-primary"/>Invoice completed</label>{draft.invoiced&&<Field label="Invoice number"><Input value={draft.invoice_number||""} onChange={e=>set("invoice_number",e.target.value||null)}/></Field>}</div><div className="mt-4"><Field label="Repair notes"><Textarea value={draft.notes||""} onChange={e=>set("notes",e.target.value||null)} className="min-h-24" placeholder="Diagnosis, quotation and workshop notes…"/></Field></div></FormSection>
      <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end"><Button variant="outline" onClick={()=>setFormOpen(false)}>Cancel</Button><Button onClick={()=>void save()} disabled={saving}>{saving?"Saving…":editingId?"Save changes":"Add repair"}</Button></div>
    </div></DialogContent></Dialog>

    <Dialog open={!!selected} onOpenChange={open=>!open&&setSelected(null)}><DialogContent className="w-[calc(100%-20px)] max-w-3xl overflow-hidden rounded-2xl border border-border bg-card p-0 shadow-xl">{selected&&<WorkshopDetail
      icon={<Wrench className="h-5 w-5" />}
      reference={`Ticket ${selected.ticket_number}`}
      title={selected.client}
      subtitle={<span className="font-mono uppercase text-primary">{selected.tool_code}</span>}
      badges={<><StatusBadge status={selected.status}/><PriorityBadge priority={selected.priority}/>{selected.is_warranty&&<Badge className="rounded-md bg-emerald-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white"><ShieldCheck className="mr-1 h-3 w-3"/>Warranty repair</Badge>}</>}
      overlay={selected.status==="scrapped"?<div className="pointer-events-none absolute inset-0 z-30 grid place-items-center overflow-hidden" aria-hidden><span className="-rotate-12 whitespace-nowrap rounded-xl border-[7px] border-red-600/20 px-7 py-3 text-5xl font-black tracking-[.16em] text-red-600/20 sm:text-7xl">SCRAPPED</span></div>:null}
      actions={<><Button variant="outline" className="sm:min-w-36" onClick={()=>openEdit(selected)}><Edit3 className="mr-2 h-4 w-4"/>Edit details</Button>{!["completed","scrapped"].includes(selected.status)&&<><Button variant="destructive" onClick={()=>setScrapOpen(true)}><Trash2 className="mr-2 h-4 w-4"/>Scrap tool</Button><Button className="sm:min-w-40" onClick={()=>void updateStatus(selected,"completed")}><CheckCircle2 className="mr-2 h-4 w-4"/>Complete & archive</Button></>}</>}
    >
      <DialogHeader className="sr-only"><DialogTitle>Repair ticket {selected.ticket_number}</DialogTitle></DialogHeader>
      {selected.is_warranty&&<div className="flex gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600"/><div><p className="text-sm font-bold text-emerald-800 dark:text-emerald-200">Covered warranty repair</p><p className="mt-0.5 text-xs text-emerald-700 dark:text-emerald-300">Automatically matched to {tickets.find(t=>t.id===selected.warranty_source_ticket_id)?.ticket_number||"a previous repair"} by tool code.</p></div></div>}
      <DetailValue label="Tool information" value={<p className="whitespace-pre-wrap font-normal leading-6">{selected.tool_information}</p>} icon={<Hammer className="h-3.5 w-3.5"/>}/>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3"><DetailValue label="Received" value={formatDate(selected.date_received_by_client)} icon={<CalendarClock className="h-3.5 w-3.5"/>}/><DetailValue label="Assigned to" value={memberLabel(selected.assigned_to?memberMap.get(selected.assigned_to):null)} icon={<UserRound className="h-3.5 w-3.5"/>}/><DetailValue label="Deadline" value={formatDate(selected.deadline_date)}/><DetailValue label="Supplier return" value={formatDate(selected.date_received_back_from_supplier)}/><DetailValue label="Warranty" value={selected.warranty_expires_at?`${selected.warranty_months} months · to ${formatDate(selected.warranty_expires_at)}`:"Not set"}/><DetailValue label="Invoice" value={selected.invoiced?selected.invoice_number||"Completed":"Not invoiced"}/></div>
      <div className="grid gap-2.5 sm:grid-cols-2"><DetailValue label="Supplier information" value={<p className="whitespace-pre-wrap font-normal">{selected.supplier_information||"—"}</p>}/><DetailValue label="Customer information" value={<p className="whitespace-pre-wrap font-normal">{selected.customer_information||"—"}</p>}/></div>
      {!["completed","scrapped"].includes(selected.status)&&<DetailSection title="Move the repair forward"><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{SERVICE_STATUSES.map(([id,label])=><button key={id} onClick={()=>void updateStatus(selected,id)} className={cn("rounded-lg border px-3 py-2 text-xs font-semibold transition",selected.status===id?"border-primary bg-primary text-primary-foreground":"border-border bg-card hover:border-primary/40 hover:bg-accent/40")}>{label}</button>)}</div></DetailSection>}
      {selected.notes&&<DetailValue label="Repair notes" value={<p className="whitespace-pre-wrap font-normal leading-6">{selected.notes}</p>}/>}
      {selected.scrap_reason&&<DetailValue label="Scrap reason" value={<p className="font-normal text-red-700 dark:text-red-300">{selected.scrap_reason}</p>}/>}
      <EntityComments entityType="repair" entityId={selected.id} defaultOpen/>
    </WorkshopDetail>}</DialogContent></Dialog>

    <Dialog open={scrapOpen} onOpenChange={setScrapOpen}><DialogContent className="w-[calc(100%-24px)] max-w-md rounded-[26px]"><DialogHeader><DialogTitle className="flex items-center gap-2 text-xl font-black text-destructive"><AlertTriangle className="h-5 w-5"/>Mark this tool as scrapped?</DialogTitle></DialogHeader><p className="text-sm text-muted-foreground">The record is not deleted. It moves to history and receives a permanent red SCRAPPED stamp.</p><div><Label className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-muted-foreground">Reason (recommended)</Label><Textarea value={scrapReason} onChange={e=>setScrapReason(e.target.value)} placeholder="Unsafe to repair, parts unavailable…" className="min-h-24"/></div><div className="flex justify-end gap-2"><Button variant="outline" onClick={()=>setScrapOpen(false)}>Cancel</Button><Button variant="destructive" disabled={saving} onClick={()=>void scrap()}>{saving?"Saving…":"Confirm scrap"}</Button></div></DialogContent></Dialog>
  </div>;
}

function Field({label,children,wide=false}:{label:string;children:React.ReactNode;wide?:boolean}){return <div className={cn(wide&&"sm:col-span-2")}><Label className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-muted-foreground">{label}</Label>{children}</div>}
function FormSection({title,description,children}:{title:string;description?:string;children:React.ReactNode}){return <section><div className="mb-3"><h3 className="text-sm font-black">{title}</h3>{description&&<p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}</div>{children}</section>}
function StatusSelect({value,onChange}:{value:string;onChange:(value:string)=>void}){return <Select value={value} onValueChange={onChange}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{SERVICE_STATUSES.map(([id,label])=><SelectItem key={id} value={id}>{label}</SelectItem>)}</SelectContent></Select>}
function TeamSelect({value,team,onChange}:{value:string|null;team:TeamMember[];onChange:(value:string|null)=>void}){return <Select value={value||"unassigned"} onValueChange={next=>onChange(next==="unassigned"?null:next)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="unassigned">Unassigned</SelectItem>{team.map(member=><SelectItem key={member.id} value={member.id}>{memberLabel(member)}</SelectItem>)}</SelectContent></Select>}
