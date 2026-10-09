import { useCallback, useEffect, useMemo, useState } from "react";
import { Hammer, Plus, Printer, Trash2, Upload, FileText, Image as ImageIcon, CheckSquare, Square, Clock3, Package, Puzzle, Download, ExternalLink, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import EntityComments from "@/components/admin/EntityComments";
import { MenuPortal, useViewportMenuPosition } from "@/hooks/useViewportMenuPosition";
import { WorkshopHeader, WorkshopToolbar, WorkshopTabs, WorkshopPanel, DetailSection, PrioritySelect, PriorityBadge, formatDate, isOverdue, type TeamMember, memberLabel } from "@/components/admin/workshop/shared";
import { FABRICATION_STAGES, stageLabel, stageIndex, generateFabricationPdf, PROJECT_TYPES, typeLabel, type FabProject, type FabMaterial, type FabPart, type FabTime, type FabFile } from "@/lib/fabricationPdf";

const db = supabase as any;
const FIELD_LABEL: Record<string, string> = { due_date: "Due date", priority: "Priority", assigned_to: "Assigned to" };
const BUCKET = "fabrication-files";

const STAGE_TONE: Record<string, string> = {
  stripping: "border-l-logo-cyan text-logo-cyan bg-logo-cyan/10",
  awaiting_quote_approval: "border-l-amber-500 text-amber-500 bg-amber-500/10",
  de_tiling: "border-l-sky-400 text-sky-400 bg-sky-400/10",
  sandblasting: "border-l-logo-violet text-logo-violet bg-logo-violet/10",
  welding: "border-l-logo-magenta text-logo-magenta bg-logo-magenta/10",
  assembly: "border-l-rose-400 text-rose-400 bg-rose-400/10",
  spray_painting: "border-l-lime-500 text-lime-500 bg-lime-500/10",
  ready_for_collection: "border-l-emerald-500 text-emerald-500 bg-emerald-500/10",
  completed: "border-l-muted-foreground text-muted-foreground bg-muted",
};

function TypeChip({ type }: { type?: string }) {
  const repair = type === "repair";
  return <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide", repair ? "border-amber-500/40 text-amber-500" : "border-logo-cyan/40 text-logo-cyan")}>{typeLabel(type)}</span>;
}

function StageChip({ stage }: { stage: string }) {
  return <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide", STAGE_TONE[stage]?.split(" ").slice(1).join(" "))}>{stageLabel(stage)}</span>;
}

function ContextMenu({ x, y, onClose, children }: { x: number; y: number; onClose: () => void; children: React.ReactNode }) {
  const { ref, style } = useViewportMenuPosition(x, y);
  useEffect(() => {
    const close = () => onClose();
    window.addEventListener("click", close); window.addEventListener("scroll", close, true);
    return () => { window.removeEventListener("click", close); window.removeEventListener("scroll", close, true); };
  }, [onClose]);
  return <MenuPortal><div ref={ref} style={style} className="z-[200] min-w-[200px] overflow-y-auto rounded-xl border border-border bg-popover p-1 text-sm shadow-xl" onClick={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}>{children}</div></MenuPortal>;
}
const MenuItem = ({ onClick, children, danger }: { onClick: () => void; children: React.ReactNode; danger?: boolean }) =>
  <button type="button" onClick={onClick} className={cn("flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs hover:bg-accent", danger && "text-destructive")}>{children}</button>;
const MenuLabel = ({ children }: { children: React.ReactNode }) => <p className="px-2.5 pb-1 pt-2 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{children}</p>;

export default function FabricationPage() {
  const { toast } = useToast();
  const [projects, setProjects] = useState<FabProject[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"active" | "history">("active");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await db.from("fabrication_projects").select("*").order("start_date", { ascending: true });
    if (error) toast({ title: "Could not load projects", description: error.message, variant: "destructive" });
    setProjects(data || []); setLoading(false);
  }, [toast]);

  useEffect(() => {
    load();
    supabase.from("profiles").select("id, full_name, email").then(({ data }) => setTeam((data as TeamMember[]) || []));
    const ch = supabase.channel("fabrication-projects").on("postgres_changes", { event: "*", schema: "public", table: "fabrication_projects" }, () => load()).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  const [typeFilter, setTypeFilter] = useState<"all" | "new_build" | "repair">("all");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects.filter((p) => typeFilter === "all" || (p.project_type || "new_build") === typeFilter).filter((p) => (tab === "history" ? p.stage === "completed" : p.stage !== "completed"))
      .filter((p) => !q || [p.name, p.client_name, p.project_number].some((v) => v?.toLowerCase().includes(q)));
  }, [projects, tab, query, typeFilter]);

  const history = useMemo(() => [...filtered].sort((a, b) => (a.completed_at || a.start_date).localeCompare(b.completed_at || b.start_date)), [filtered]);
  const active = projects.filter((p) => p.stage !== "completed");
  const overdue = active.filter((p) => isOverdue(p.due_date)).length;

  const update = async (ids: string[], patch: Partial<FabProject>) => {
    const full: any = { ...patch };
    if (patch.stage) full.completed_at = patch.stage === "completed" ? new Date().toISOString() : null;
    const { error } = await db.from("fabrication_projects").update(full).in("id", ids);
    if (error) return toast({ title: "Update failed", description: error.message, variant: "destructive" });
    setProjects((prev) => prev.map((p) => ids.includes(p.id) ? { ...p, ...full } : p));
    if (patch.stage === "completed") toast({ title: ids.length > 1 ? `${ids.length} projects completed` : "Project completed", description: "Moved to History." });
  };
  const remove = async (ids: string[]) => {
    if (!confirm(`Permanently delete ${ids.length} project${ids.length > 1 ? "s" : ""} and their files?`)) return;
    const { data: files } = await db.from("fabrication_files").select("storage_path").in("project_id", ids);
    if (files?.length) await supabase.storage.from(BUCKET).remove(files.map((f: any) => f.storage_path));
    const { error } = await db.from("fabrication_projects").delete().in("id", ids);
    if (error) return toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    setProjects((prev) => prev.filter((p) => !ids.includes(p.id))); setSelected(new Set());
  };

  const targetIds = (id: string) => selected.has(id) ? [...selected] : [id];
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const row = (p: FabProject) => {
    const late = isOverdue(p.due_date, p.stage === "completed");
    const isSel = selected.has(p.id);
    return <button key={p.id} type="button"
      onClick={() => selectMode ? toggle(p.id) : setOpenId(p.id)}
      onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, id: p.id }); }}
      className={cn("group flex w-full items-center gap-3 border-l-[3px] bg-card px-3 py-3 text-left transition hover:bg-accent/20 sm:px-4", STAGE_TONE[p.stage]?.split(" ")[0], late && "border-l-destructive", isSel && "bg-primary/[0.07]")}>
      {selectMode && (isSel ? <CheckSquare className="h-4 w-4 shrink-0 text-primary" /> : <Square className="h-4 w-4 shrink-0 text-muted-foreground" />)}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-mono text-[11px] font-bold uppercase text-muted-foreground">{p.project_number || "FAB"}</span>
          <span className="truncate text-sm font-semibold">{p.name}</span>
          {p.client_name && <span className="truncate text-xs text-muted-foreground">{p.client_name}</span>}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5"><TypeChip type={p.project_type} /><StageChip stage={p.stage} /><PriorityBadge priority={p.priority} /></div>
      </div>
      <div className="shrink-0 text-right text-[11px] text-muted-foreground">
        <p>{memberLabel(team.find((t) => t.id === p.assigned_to))}</p>
        <p className="tabular-nums">Created {formatDate(p.start_date)}</p>
        {p.stage === "completed" ? <p className="tabular-nums">Done {formatDate(p.completed_at?.slice(0, 10))}</p>
          : p.due_date && <p className={cn("tabular-nums", late && "font-bold text-destructive")}>Due {formatDate(p.due_date)}</p>}
      </div>
    </button>;
  };

  const menuIds = menu ? targetIds(menu.id) : [];

  return <div className="space-y-4">
    <WorkshopHeader eyebrow="Workshop" title="Fabrication Projects" description="Track every fabrication job from stripping through to collection, with materials, parts, hours and files in one place."
      stats={[
        { label: "Active", value: active.length },
        { label: "Overdue", value: overdue, tone: overdue ? "danger" : "default" },
        { label: "Ready for collection", value: active.filter((p) => p.stage === "ready_for_collection").length },
        { label: "Completed", value: projects.length - active.length },
      ]}>
      <Button onClick={() => setCreating(true)}><Plus className="mr-1.5 h-4 w-4" />New project</Button>
    </WorkshopHeader>

    <WorkshopToolbar query={query} onQuery={setQuery} placeholder="Search project, client or number…">
      <div className="flex flex-wrap items-center gap-2">
        <WorkshopTabs value={tab} onChange={(v) => { setTab(v as any); setSelected(new Set()); }} tabs={[{ id: "active", label: "Active", count: active.length }, { id: "history", label: "History", count: projects.length - active.length }]} />
        <WorkshopTabs value={typeFilter} onChange={(v) => { setTypeFilter(v as any); setSelected(new Set()); }} tabs={[
          { id: "all", label: "All", count: projects.length },
          { id: "new_build", label: "New builds", count: projects.filter((p) => (p.project_type || "new_build") === "new_build").length },
          { id: "repair", label: "Repairs", count: projects.filter((p) => p.project_type === "repair").length }]} />
        <Button variant={selectMode ? "default" : "outline"} size="sm" onClick={() => { setSelectMode((s) => !s); setSelected(new Set()); }}>Select</Button>
        {selectMode && <Button variant="outline" size="sm" onClick={() => setSelected(selected.size === filtered.length ? new Set() : new Set(filtered.map((p) => p.id)))}>
          {selected.size === filtered.length && filtered.length ? "Clear all" : `Select all (${filtered.length})`}</Button>}
        {selectMode && selected.size > 0 && <Select onValueChange={(v) => update([...selected], { stage: v })}>
          <SelectTrigger className="h-9 w-[170px]"><SelectValue placeholder={`Move ${selected.size} to…`} /></SelectTrigger>
          <SelectContent>{FABRICATION_STAGES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
        </Select>}
        {selectMode && selected.size > 0 && <Button variant="outline" size="sm" className="text-destructive" onClick={() => remove([...selected])}><Trash2 className="h-4 w-4" /></Button>}
      </div>
    </WorkshopToolbar>

    {loading ? <p className="py-10 text-center text-sm text-muted-foreground">Loading projects…</p>
      : tab === "history" ? <section className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex h-10 items-center gap-2 border-b border-border bg-muted/40 px-3 text-[11px] font-semibold text-muted-foreground">Completed projects · earliest first</div>
          <div className="divide-y divide-border">{history.length ? history.map(row) : <p className="py-10 text-center text-sm text-muted-foreground">No completed projects yet.</p>}</div>
        </section>
      : <div className="space-y-3">{FABRICATION_STAGES.filter(([s]) => s !== "completed").map(([stage, label]) => {
          const rows = filtered.filter((p) => p.stage === stage);
          return <section key={stage} className={cn("overflow-hidden rounded-xl border border-border border-l-4 bg-card", STAGE_TONE[stage]?.split(" ")[0])}>
            <div className="flex h-10 items-center gap-2 border-b border-border bg-muted/40 px-3">
              <StageChip stage={stage} /><span className="text-[11px] font-semibold tabular-nums text-muted-foreground">{rows.length}</span>
            </div>
            <div className="divide-y divide-border">{rows.length ? rows.map(row) : <p className="px-4 py-3 text-xs text-muted-foreground">No projects in {label.toLowerCase()}.</p>}</div>
          </section>;
        })}</div>}

    {menu && <ContextMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)}>
      {menuIds.length > 1 && <MenuLabel>{menuIds.length} selected</MenuLabel>}
      {menuIds.length === 1 && <MenuItem onClick={() => { setOpenId(menu.id); setMenu(null); }}>Open details</MenuItem>}
      <MenuItem onClick={() => { setSelectMode(true); toggle(menu.id); setMenu(null); }}>Select</MenuItem>
      <MenuLabel>Move to section</MenuLabel>
      {FABRICATION_STAGES.map(([v, l]) => <MenuItem key={v} onClick={() => { update(menuIds, { stage: v }); setMenu(null); }}>{l}</MenuItem>)}
      <div className="my-1 h-px bg-border" />
      <MenuItem danger onClick={() => { setMenu(null); remove(menuIds); }}><Trash2 className="h-3.5 w-3.5" />Delete</MenuItem>
    </ContextMenu>}

    <NewProjectDialog open={creating} onClose={() => setCreating(false)} team={team} onCreated={(p) => { setProjects((prev) => [...prev, p]); setOpenId(p.id); }} />
    {openId && <ProjectPanel id={openId} team={team} onClose={() => setOpenId(null)} onChange={(p) => setProjects((prev) => prev.map((x) => x.id === p.id ? p : x))} onDelete={() => { remove([openId]); setOpenId(null); }} />}
  </div>;
}

function NewProjectDialog({ open, onClose, team, onCreated }: { open: boolean; onClose: () => void; team: TeamMember[]; onCreated: (p: FabProject) => void }) {
  const { toast } = useToast();
  const blank = { name: "", project_number: "", client_name: "", start_date: new Date().toISOString().slice(0, 10), due_date: "", priority: "medium", assigned_to: "none", description: "", project_type: "new_build" };
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const save = async () => {
    if (!form.name.trim()) return toast({ title: "Project name is required", variant: "destructive" });
    setSaving(true);
    const { data, error } = await db.from("fabrication_projects").insert({
      ...form, name: form.name.trim(), due_date: form.due_date || null, assigned_to: form.assigned_to === "none" ? null : form.assigned_to,
      project_number: form.project_number || `FAB-${Date.now().toString().slice(-5)}`,
    }).select().single();
    setSaving(false);
    if (error) return toast({ title: "Could not create project", description: error.message, variant: "destructive" });
    onCreated(data); setForm(blank); onClose();
  };
  return <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>New fabrication project</DialogTitle></DialogHeader>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Label>Project name</Label><Input value={form.name} onChange={(e) => set("name", e.target.value)} /></div>
        <div><Label>Project number</Label><Input value={form.project_number} placeholder="Auto" onChange={(e) => set("project_number", e.target.value)} /></div>
        <div><Label>Client</Label><Input value={form.client_name} onChange={(e) => set("client_name", e.target.value)} /></div>
        <div><Label>Start date</Label><Input type="date" value={form.start_date} onChange={(e) => set("start_date", e.target.value)} /></div>
        <div><Label>Due date</Label><Input type="date" value={form.due_date} onChange={(e) => set("due_date", e.target.value)} /></div>
        <div><Label>Type</Label><Select value={form.project_type} onValueChange={(v) => set("project_type", v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{PROJECT_TYPES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
        </Select></div>
        <div><Label>Priority</Label><PrioritySelect value={form.priority} onChange={(v) => set("priority", v)} /></div>
        <div><Label>Assigned to</Label><Select value={form.assigned_to} onValueChange={(v) => set("assigned_to", v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="none">Unassigned</SelectItem>{team.map((t) => <SelectItem key={t.id} value={t.id}>{memberLabel(t)}</SelectItem>)}</SelectContent>
        </Select></div>
        <div className="sm:col-span-2"><Label>Description</Label><Textarea rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} /></div>
      </div>
      <Button onClick={save} disabled={saving} className="mt-2 w-full">{saving ? "Creating…" : "Create project"}</Button>
    </DialogContent>
  </Dialog>;
}

function ProjectPanel({ id, team, onClose, onChange, onDelete }: { id: string; team: TeamMember[]; onClose: () => void; onChange: (p: FabProject) => void; onDelete: () => void }) {
  const { toast } = useToast();
  const [p, setP] = useState<FabProject | null>(null);
  const [materials, setMaterials] = useState<FabMaterial[]>([]);
  const [parts, setParts] = useState<FabPart[]>([]);
  const [time, setTime] = useState<FabTime[]>([]);
  const [files, setFiles] = useState<FabFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [printing, setPrinting] = useState(false);

  const loadAll = useCallback(async () => {
    const [pr, m, pa, t, f] = await Promise.all([
      db.from("fabrication_projects").select("*").eq("id", id).single(),
      db.from("fabrication_materials").select("*").eq("project_id", id).order("created_at"),
      db.from("fabrication_parts").select("*").eq("project_id", id).order("created_at"),
      db.from("fabrication_time_entries").select("*").eq("project_id", id).order("work_date"),
      db.from("fabrication_files").select("*").eq("project_id", id).order("created_at"),
    ]);
    setP(pr.data); setMaterials(m.data || []); setParts(pa.data || []); setTime(t.data || []);
    const list: FabFile[] = f.data || [];
    if (list.length) {
      const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls(list.map((x) => x.storage_path), 3600);
      list.forEach((x, i) => { x.url = signed?.[i]?.signedUrl; });
    }
    setFiles(list);
  }, [id]);
  useEffect(() => { loadAll(); }, [loadAll]);

  const patch = async (change: Partial<FabProject>) => {
    if (!p) return;
    const full: any = { ...change };
    if (change.stage) full.completed_at = change.stage === "completed" ? new Date().toISOString() : null;
    const next = { ...p, ...full }; setP(next); onChange(next);
    const { error } = await db.from("fabrication_projects").update(full).eq("id", id);
    if (error) toast({ title: "Save failed", description: error.message, variant: "destructive" });
  };
  const [isAdmin, setIsAdmin] = useState(false);
  const [requests, setRequests] = useState<any[]>([]);
  const loadRequests = useCallback(async () => {
    const { data } = await db.from("fabrication_change_requests").select("*").eq("project_id", id).eq("status", "pending").order("created_at");
    setRequests(data || []);
  }, [id]);
  useEffect(() => { db.rpc("is_admin").then(({ data }: any) => setIsAdmin(!!data)); loadRequests(); }, [loadRequests]);
  const showVal = (field: string, v: string | null) => !v ? "—" : field === "assigned_to" ? memberLabel(team.find((t) => t.id === v)) : field === "due_date" ? formatDate(v) : v;
  const guarded = async (field: "due_date" | "priority" | "assigned_to", value: string | null) => {
    if (!p || (p as any)[field] === value) return;
    if (isAdmin) return patch({ [field]: value } as any);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await db.from("fabrication_change_requests").insert({ project_id: id, field, old_value: (p as any)[field] ?? null, new_value: value, requested_by: u.user?.id });
    if (error) return toast({ title: "Request failed", description: error.message, variant: "destructive" });
    toast({ title: "Sent for admin approval", description: `${FIELD_LABEL[field]} will change once an admin approves.` });
    loadRequests();
  };
  const review = async (rid: string, approve: boolean) => {
    const { error } = await db.rpc("review_fabrication_change", { p_id: rid, p_approve: approve });
    if (error) return toast({ title: "Review failed", description: error.message, variant: "destructive" });
    toast({ title: approve ? "Change approved" : "Change rejected" });
    loadAll(); loadRequests();
  };
  const addRow = async (table: string, row: any, setter: (fn: (r: any[]) => any[]) => void) => {
    const { data, error } = await db.from(table).insert({ project_id: id, ...row }).select().single();
    if (error) return toast({ title: "Could not add", description: error.message, variant: "destructive" });
    setter((r) => [...r, data]);
  };
  const editRow = async (table: string, rowId: string, change: any, setter: (fn: (r: any[]) => any[]) => void) => {
    setter((r) => r.map((x) => x.id === rowId ? { ...x, ...change } : x));
    await db.from(table).update(change).eq("id", rowId);
  };
  const delRow = async (table: string, rowId: string, setter: (fn: (r: any[]) => any[]) => void) => {
    setter((r) => r.filter((x) => x.id !== rowId));
    await db.from(table).delete().eq("id", rowId);
  };

  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    setUploading(true);
    for (const file of Array.from(list)) {
      if (file.size > 20 * 1024 * 1024) { toast({ title: `${file.name} is over 20MB`, variant: "destructive" }); continue; }
      const path = `${id}/${Date.now()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
      if (error) { toast({ title: "Upload failed", description: error.message, variant: "destructive" }); continue; }
      await db.from("fabrication_files").insert({ project_id: id, file_name: file.name, storage_path: path, mime_type: file.type, file_size: file.size });
    }
    setUploading(false); loadAll();
  };
  const removeFile = async (f: FabFile) => {
    if (!confirm(`Delete ${f.file_name}?`)) return;
    await supabase.storage.from(BUCKET).remove([f.storage_path]);
    await db.from("fabrication_files").delete().eq("id", f.id);
    setFiles((r) => r.filter((x) => x.id !== f.id));
  };

  const print = async () => {
    if (!p) return; setPrinting(true);
    try { await generateFabricationPdf({ project: p, materials, parts, time, files, assignee: memberLabel(team.find((t) => t.id === p.assigned_to)) }); }
    catch (e: any) { toast({ title: "PDF failed", description: e.message, variant: "destructive" }); }
    setPrinting(false);
  };

  if (!p) return null;
  const totalHours = time.reduce((s, t) => s + Number(t.hours || 0), 0);
  const current = stageIndex(p.stage);
  const late = isOverdue(p.due_date, p.stage === "completed");

  return <WorkshopPanel open onOpenChange={(o) => !o && onClose()} icon={<Hammer className="h-5 w-5" />} reference={p.project_number || "Fabrication"} title={p.name}
    subtitle={p.client_name || undefined} badges={<><StageChip stage={p.stage} />{late && <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-bold text-destructive">Overdue</span>}</>}
    actions={<>
      <Button onClick={print} disabled={printing} className="flex-1"><Printer className="mr-1.5 h-4 w-4" />{printing ? "Preparing PDF…" : "Print / Save A4 PDF"}</Button>
      {p.stage === "completed"
        ? <Button variant="outline" onClick={() => patch({ stage: "ready_for_collection" })}><RotateCcw className="mr-1.5 h-4 w-4" />Reopen</Button>
        : <Button variant="outline" onClick={() => patch({ stage: "completed" })}>Mark completed</Button>}
      <Button variant="outline" className="text-destructive" onClick={onDelete}><Trash2 className="h-4 w-4" /></Button>
    </>}>

    <section>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="font-display text-[10px] font-bold uppercase text-muted-foreground">Currently in · {stageLabel(p.stage)}</p>
        <TypeChip type={p.project_type} />
      </div>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5">
        {FABRICATION_STAGES.map(([v, l], i) => <button key={v} type="button" onClick={() => patch({ stage: v })}
          className={cn("rounded-lg border px-2 py-2 text-[10px] font-bold uppercase leading-tight transition",
            i === current ? cn("border-current shadow-[0_0_12px_-4px_currentColor]", STAGE_TONE[v]?.split(" ").slice(1).join(" ")) : "border-border text-muted-foreground hover:bg-accent")}>{l}</button>)}
      </div>
    </section>

    <DetailSection title="Project details">
      <div className="grid gap-3 sm:grid-cols-3">
        <div><Label className="text-[10px]">Name 🔒</Label><Input value={p.name} disabled className="opacity-70" /></div>
        <div><Label className="text-[10px]">Project number 🔒</Label><Input value={p.project_number || ""} disabled className="opacity-70" /></div>
        <div><Label className="text-[10px]">Client 🔒</Label><Input value={p.client_name || ""} disabled className="opacity-70" /></div>
        <div><Label className="text-[10px]">Start date 🔒</Label><Input type="date" value={p.start_date} disabled className="opacity-70" /></div>
        <div><Label className="text-[10px]">Due date{!isAdmin && " · needs approval"}</Label><Input type="date" value={p.due_date || ""} onChange={(e) => guarded("due_date", e.target.value || null)} /></div>
        <div><Label className="text-[10px]">Priority{!isAdmin && " · needs approval"}</Label><PrioritySelect value={p.priority} onChange={(v) => guarded("priority", v)} /></div>
        <div><Label className="text-[10px]">Assigned to{!isAdmin && " · needs approval"}</Label><Select value={p.assigned_to || "none"} onValueChange={(v) => guarded("assigned_to", v === "none" ? null : v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="none">Unassigned</SelectItem>{team.map((t) => <SelectItem key={t.id} value={t.id}>{memberLabel(t)}</SelectItem>)}</SelectContent>
        </Select></div>
        {requests.length > 0 && <div className="sm:col-span-3 space-y-1.5 rounded-lg border border-logo-violet/30 bg-logo-violet/5 p-2">
          <p className="text-[10px] font-semibold uppercase text-logo-violet">Pending approval</p>
          {requests.map((r) => <div key={r.id} className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-semibold">{FIELD_LABEL[r.field]}</span>
            <span className="text-muted-foreground">{showVal(r.field, r.old_value)} → <b className="text-foreground">{showVal(r.field, r.new_value)}</b></span>
            <span className="text-[10px] text-muted-foreground">by {memberLabel(team.find((t) => t.id === r.requested_by))}</span>
            {isAdmin && <span className="ml-auto flex gap-1">
              <Button size="sm" className="h-6 px-2 text-[10px]" onClick={() => review(r.id, true)}>Approve</Button>
              <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={() => review(r.id, false)}>Reject</Button></span>}
          </div>)}
        </div>}
        <div className="sm:col-span-3"><Label className="text-[10px]">Description</Label><Textarea rows={2} defaultValue={p.description || ""} onBlur={(e) => patch({ description: e.target.value || null })} /></div>
        <div className="sm:col-span-3"><Label className="text-[10px]">Notes</Label><Textarea rows={2} defaultValue={p.notes || ""} onBlur={(e) => patch({ notes: e.target.value || null })} /></div>
      </div>
    </DetailSection>

    <DetailSection title={`Material list (${materials.length})`}>
      <div className="space-y-1.5">
        {materials.map((m) => <div key={m.id} className="grid grid-cols-[1fr_70px_70px_1fr_32px] gap-1.5">
          <Input className="h-8 text-xs" defaultValue={m.material} onBlur={(e) => editRow("fabrication_materials", m.id, { material: e.target.value }, setMaterials as any)} />
          <Input className="h-8 text-xs" type="number" defaultValue={m.quantity} onBlur={(e) => editRow("fabrication_materials", m.id, { quantity: Number(e.target.value) || 0 }, setMaterials as any)} />
          <Input className="h-8 text-xs" placeholder="Unit" defaultValue={m.unit || ""} onBlur={(e) => editRow("fabrication_materials", m.id, { unit: e.target.value }, setMaterials as any)} />
          <Input className="h-8 text-xs" placeholder="Notes" defaultValue={m.notes || ""} onBlur={(e) => editRow("fabrication_materials", m.id, { notes: e.target.value }, setMaterials as any)} />
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => delRow("fabrication_materials", m.id, setMaterials as any)}><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>)}
        <AddInline placeholder="Add material, e.g. 3mm mild steel plate" icon={<Package className="h-4 w-4" />} onAdd={(v) => addRow("fabrication_materials", { material: v }, setMaterials as any)} />
      </div>
    </DetailSection>

    <DetailSection title={`Project parts (${parts.filter((x) => x.status === "done").length}/${parts.length} done)`}>
      <div className="space-y-1.5">
        {parts.map((pt) => <div key={pt.id} className="grid grid-cols-[1fr_70px_130px_32px] gap-1.5">
          <Input className="h-8 text-xs" defaultValue={pt.name} onBlur={(e) => editRow("fabrication_parts", pt.id, { name: e.target.value }, setParts as any)} />
          <Input className="h-8 text-xs" type="number" defaultValue={pt.quantity} onBlur={(e) => editRow("fabrication_parts", pt.id, { quantity: Number(e.target.value) || 0 }, setParts as any)} />
          <Select value={pt.status} onValueChange={(v) => editRow("fabrication_parts", pt.id, { status: v }, setParts as any)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="todo">To do</SelectItem><SelectItem value="in_progress">In progress</SelectItem><SelectItem value="done">Done</SelectItem></SelectContent>
          </Select>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => delRow("fabrication_parts", pt.id, setParts as any)}><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>)}
        <AddInline placeholder="Add part, e.g. Hopper side panel" icon={<Puzzle className="h-4 w-4" />} onAdd={(v) => addRow("fabrication_parts", { name: v }, setParts as any)} />
      </div>
    </DetailSection>

    <DetailSection title={`Hours worked · ${totalHours.toFixed(1)} h total`}>
      <div className="space-y-1.5">
        {time.map((t) => <div key={t.id} className="grid grid-cols-[130px_1fr_70px_1fr_32px] gap-1.5">
          <Input className="h-8 text-xs" type="date" defaultValue={t.work_date} onBlur={(e) => editRow("fabrication_time_entries", t.id, { work_date: e.target.value }, setTime as any)} />
          <Input className="h-8 text-xs" placeholder="Worked by" defaultValue={t.worker_name || ""} onBlur={(e) => editRow("fabrication_time_entries", t.id, { worker_name: e.target.value }, setTime as any)} />
          <Input className="h-8 text-xs" type="number" step="0.25" defaultValue={t.hours} onBlur={(e) => editRow("fabrication_time_entries", t.id, { hours: Number(e.target.value) || 0 }, setTime as any)} />
          <Input className="h-8 text-xs" placeholder="Note" defaultValue={t.note || ""} onBlur={(e) => editRow("fabrication_time_entries", t.id, { note: e.target.value }, setTime as any)} />
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => delRow("fabrication_time_entries", t.id, setTime as any)}><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>)}
        <AddInline placeholder="Hours, e.g. 2.5" type="number" icon={<Clock3 className="h-4 w-4" />} onAdd={(v) => addRow("fabrication_time_entries", { hours: Number(v) || 0 }, setTime as any)} />
      </div>
    </DetailSection>

    <DetailSection title={`Files & photos (${files.length})`}>
      <label className={cn("flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border p-4 text-sm text-muted-foreground transition hover:border-logo-cyan hover:text-foreground", uploading && "opacity-60")}>
        <Upload className="h-4 w-4" />{uploading ? "Uploading…" : "Upload PDFs or photos (max 20MB each)"}
        <input type="file" multiple accept="application/pdf,image/*" className="hidden" disabled={uploading} onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
      </label>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {files.map((f) => {
          const img = f.mime_type?.startsWith("image/");
          return <div key={f.id} className="group relative overflow-hidden rounded-lg border border-border bg-muted/30">
            <a href={f.url} target="_blank" rel="noreferrer" className="block aspect-[4/3]">
              {img && f.url ? <img src={f.url} alt={f.file_name} className="h-full w-full object-cover" />
                : <div className="grid h-full place-items-center text-logo-magenta"><FileText className="h-8 w-8" /></div>}
            </a>
            <div className="flex items-center gap-1 border-t border-border bg-card px-1.5 py-1">
              {img ? <ImageIcon className="h-3 w-3 shrink-0 text-logo-cyan" /> : <FileText className="h-3 w-3 shrink-0 text-logo-magenta" />}
              <span className="min-w-0 flex-1 truncate text-[10px]">{f.file_name}</span>
              <a href={f.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground"><ExternalLink className="h-3 w-3" /></a>
              <a href={f.url} download={f.file_name} className="text-muted-foreground hover:text-foreground"><Download className="h-3 w-3" /></a>
              <button type="button" onClick={() => removeFile(f)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
            </div>
          </div>;
        })}
      </div>
    </DetailSection>

    <DetailSection title="Comments">
      <EntityComments entityType="fabrication" entityId={id} defaultOpen />
    </DetailSection>
  </WorkshopPanel>;
}

function AddInline({ placeholder, onAdd, icon, type = "text" }: { placeholder: string; onAdd: (v: string) => void; icon: React.ReactNode; type?: string }) {
  const [v, setV] = useState("");
  const submit = () => { if (!v.trim()) return; onAdd(v.trim()); setV(""); };
  return <div className="flex gap-1.5">
    <div className="relative flex-1"><span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">{icon}</span>
      <Input type={type} className="h-8 pl-8 text-xs" placeholder={placeholder} value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} /></div>
    <Button size="sm" variant="outline" className="h-8" onClick={submit}><Plus className="h-3.5 w-3.5" /></Button>
  </div>;
}
