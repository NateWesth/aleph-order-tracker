import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRight, RefreshCw, ShoppingCart, Wrench, Truck, ListChecks, Search } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLiveData } from "@/hooks/useLiveData";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { loadMyOrders, loadMyWorkshop, loadMyDispatch, loadMyTasks } from "@/services/myWork";
import { myWorkCoverOwners, loadCoveredMyWork } from '@/services/myWork';
import ContinuityPanel from '@/components/admin/ContinuityPanel';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { sortMyWork, type WorkRow } from "@/lib/myWork";
import { supplierToday } from "@/lib/supplierReliability";

const categories = [
  { id: 'orders', title: 'Purchasing & invoicing', icon: ShoppingCart, load: loadMyOrders },
  { id: 'workshop', title: 'Workshop jobs', icon: Wrench, load: loadMyWorkshop },
  { id: 'dispatch', title: 'Collections & deliveries', icon: Truck, load: loadMyDispatch },
  { id: 'tasks', title: 'Tasks & issues', icon: ListChecks, load: loadMyTasks },
] as const;
type Category = typeof categories[number]['id'];
interface MyWorkPageProps { onNavigate: (view: string) => void; }
export default function MyWorkPage({ onNavigate }: MyWorkPageProps) {
  const { user } = useAuth();
  const [rows, setRows] = useState<Partial<Record<Category, WorkRow[]>>>({});
  const [errors, setErrors] = useState<Partial<Record<Category, string>>>({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [handoverOpen, setHandoverOpen] = useState(false);
  const read = useRef(0);
  const load = useCallback(async () => {
    if (!user?.id) return;
    const generation = ++read.current;
    let covers: Awaited<ReturnType<typeof myWorkCoverOwners>>;
    try { covers = await myWorkCoverOwners(user.id); }
    catch (error) {
      if (generation !== read.current) return;
      setErrors(Object.fromEntries(categories.map(c => [c.id, error instanceof Error ? error.message : 'Temporary assignments could not load'])));
      setLoading(false); return;
    }
    const result = await Promise.allSettled(categories.map(category => loadCoveredMyWork(user.id, category.id, category.load, covers)));
    if (generation !== read.current) return;
    setRows(previous => {
      const next = { ...previous };
      result.forEach((entry, i) => { if (entry.status === 'fulfilled') next[categories[i].id] = entry.value; });
      return next;
    });
    const failures: Partial<Record<Category, string>> = {};
    result.forEach((entry, i) => { if (entry.status === 'rejected') failures[categories[i].id] = entry.reason instanceof Error ? entry.reason.message : 'Could not refresh'; });
    setErrors(failures); setLoading(false); setCheckedAt(new Date());
  }, [user?.id]);
  useEffect(() => { setRows({}); setErrors({}); setLoading(true); void load(); return () => { read.current++; }; }, [load]);
  useLiveData(['orders', 'order_items', 'companies', 'sharpening_jobs', 'repair_tickets', 'fabrication_projects', 'dispatch_documents', 'team_action_items', 'operations_exceptions', 'dispatch_routes', 'operational_leave_cover', 'responsibility_delegations'], load, { fallbackIntervalMs: 15000 });
  const open = (row: WorkRow) => {
    if (row.entityType) window.sessionStorage.setItem(`aleph:open-${row.entityType}`, row.id);
    onNavigate(row.view);
    if (row.entityType) window.setTimeout(() => window.dispatchEvent(new CustomEvent(`aleph:open-${row.entityType}`, { detail: row.id })), 80);
  };
  const total = Object.values(rows).reduce((sum, items) => sum + (items?.length ?? 0), 0);
  const incomplete = Object.keys(errors).length > 0;
  return <div className="mx-auto max-w-6xl space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-3xl font-bold">My Work</h1><p className="mt-1 text-sm text-muted-foreground">{user?.email}</p></div>
      <div className="flex flex-wrap items-center gap-2"><Button size="sm" variant="outline" onClick={() => setHandoverOpen(true)}>Handover & requests</Button><Badge variant={incomplete ? 'destructive' : 'secondary'}>{loading ? 'Loading…' : incomplete ? 'Some work unavailable' : `${total} assigned`}</Badge><Button size="icon" variant="outline" aria-label="Refresh my work" onClick={() => void load()}><RefreshCw className="h-4 w-4" /></Button></div>
    </header>
    <div className="flex flex-col gap-3"><Tabs value={tab} onValueChange={setTab}><TabsList className="flex h-auto flex-wrap justify-start gap-1"><TabsTrigger value="all">All work</TabsTrigger>{categories.map(c => <TabsTrigger key={c.id} value={c.id}><c.icon className="mr-2 h-4 w-4" />{c.title}</TabsTrigger>)}</TabsList></Tabs><div className="relative max-w-md"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="Search my work" placeholder="Search jobs, clients or orders" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} /></div></div>
    {checkedAt && <p className="text-xs text-muted-foreground">Last checked {checkedAt.toLocaleTimeString()}</p>}
    {categories.filter(c => tab === 'all' || c.id === tab).map(category => {
      const visible = sortMyWork((rows[category.id] ?? []).filter(r => `${r.title} ${r.subtitle} ${r.status}`.toLowerCase().includes(search.toLowerCase())), supplierToday());
      return <section key={category.id} className="min-w-0 border-t border-border pt-4">
        <div className="mb-3 flex items-center justify-between gap-2"><h2 className="flex items-center gap-2 text-base font-semibold"><category.icon className="h-4 w-4 text-primary" />{category.title}</h2><Badge variant="outline">{errors[category.id] ? 'Unavailable' : visible.length}</Badge></div>
        {errors[category.id] && <p role="alert" className="mb-3 text-sm text-destructive">Could not verify this work: {errors[category.id]}. Any previous entries may be stale.</p>}
        {loading ? <p className="py-5 text-sm text-muted-foreground">Loading assigned work…</p> : !visible.length && !errors[category.id] ? <p className="py-5 text-sm text-muted-foreground">{search ? 'No matching work.' : 'Nothing assigned to you here.'}</p> : <div className="divide-y divide-border">{visible.map(row => <Button key={`${row.category}-${row.id}-${row.status}`} variant="ghost" className="h-auto w-full justify-start gap-3 rounded-none px-2 py-3 text-left" onClick={() => open(row)}>
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="break-words text-sm font-semibold">{row.title}</span>{['urgent','critical','high'].includes(row.priority ?? '') && <Badge variant="destructive">{row.priority}</Badge>}</div><p className="mt-1 whitespace-normal break-words text-xs text-muted-foreground">{row.subtitle}</p><p className="mt-1 whitespace-normal break-words text-xs">{row.status}</p>{row.due && <p className={`mt-1 text-xs ${row.due.slice(0,10) < supplierToday() ? 'text-destructive' : 'text-muted-foreground'}`}>Due {row.due.slice(0,10)}</p>}</div><ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Button>)}</div>}
      </section>;
    })}
    <Dialog open={handoverOpen} onOpenChange={setHandoverOpen}><DialogContent className="max-h-[85dvh] max-w-4xl overflow-y-auto"><DialogHeader><DialogTitle>Handover & client requests</DialogTitle></DialogHeader>{handoverOpen && <ContinuityPanel />}</DialogContent></Dialog>
  </div>;
}
