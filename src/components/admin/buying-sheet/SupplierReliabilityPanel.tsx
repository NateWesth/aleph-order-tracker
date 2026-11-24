import { useState } from 'react';
import { CalendarCheck, Plus, Pencil, Loader2, RefreshCw, Truck, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { useSupplierReliability } from '@/hooks/useSupplierReliability';
import { deliveryDateError, supplierToday, type SupplierDelivery } from '@/lib/supplierReliability';

type Props = ReturnType<typeof useSupplierReliability>;
type Draft = Pick<SupplierDelivery, 'supplier_id' | 'purchase_order_number' | 'ordered_date' | 'expected_date' | 'received_date' | 'cancelled' | 'notes'>;
const emptyDraft = (): Draft => ({ supplier_id: '', purchase_order_number: '', ordered_date: supplierToday(), expected_date: '', received_date: null, cancelled: false, notes: '' });

export default function SupplierReliabilityPanel({ suppliers, deliveries, scores, loading, error, reload }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('all');
  const [editing, setEditing] = useState<SupplierDelivery | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const change = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft(old => ({ ...old, [key]: value }));
  const start = (record?: SupplierDelivery) => {
    setEditing(record ?? null); setDraft(record ?? { ...emptyDraft(), supplier_id: filter === 'all' ? '' : filter });
    setFormError(null); setFormOpen(true);
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const problem = !draft.supplier_id ? 'Choose a supplier.' : !draft.purchase_order_number.trim() ? 'Enter a PO reference.' : deliveryDateError(draft);
    if (problem) { setFormError(problem); return; }
    setSaving(true); setFormError(null);
    try {
      const payload = { ...draft, purchase_order_number: draft.purchase_order_number.trim().toUpperCase() };
      const result = editing
        ? await supabase.from('supplier_delivery_tracking').update(payload).eq('id', editing.id).eq('updated_at', editing.updated_at).select('*').maybeSingle()
        : await supabase.from('supplier_delivery_tracking').insert(payload).select('*').single();
      if (result.error) throw new Error(result.error.code === '23505' ? 'That supplier already has this PO reference. Edit the existing delivery.' : result.error.message);
      if (!result.data) throw new Error('This delivery changed on another screen. Refresh and try again.');
      // Read the saved row back through the shared list before confirming it.
      await reload();
      setFormOpen(false); toast({ title: 'Supplier delivery saved' });
    } catch (e) { setFormError(e instanceof Error ? e.message : 'Could not save delivery.'); }
    finally { setSaving(false); }
  };
  const tracked = suppliers.filter(s => deliveries.some(d => d.supplier_id === s.id));
  const visible = deliveries.filter(d => filter === 'all' || d.supplier_id === filter);
  const names = new Map(suppliers.map(s => [s.id, s.name]));
  const overdue = [...scores.values()].reduce((sum, s) => sum + s.overdue, 0);

  return <section className="min-w-0 space-y-3 border-t border-border py-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="flex items-center gap-2 text-sm font-semibold"><Truck className="h-4 w-4 text-primary" />Supplier reliability</h3>
        <p className="mt-1 text-xs text-muted-foreground">{tracked.length} suppliers tracked · {overdue} overdue deliveries</p></div>
      <Button variant="outline" size="sm" onClick={() => { setOpen(true); setFormOpen(false); }}><CalendarCheck className="mr-2 h-4 w-4" />Delivery log</Button>
    </div>
    {loading && <p className="text-xs text-muted-foreground">Loading supplier deliveries…</p>}
    {error && <div className="flex items-center gap-2 text-xs text-destructive"><span>Supplier scoring unavailable: {error}</span><Button size="icon" variant="ghost" aria-label="Retry supplier deliveries" onClick={() => void reload().catch(() => undefined)}><RefreshCw className="h-4 w-4" /></Button></div>}
    {!loading && !error && tracked.length === 0 && <p className="text-xs text-muted-foreground">No delivery dates recorded yet.</p>}
    {!error && tracked.slice(0, 5).map(supplier => {
      const score = scores.get(supplier.id);
      return <div key={supplier.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2 text-xs">
        <span className="min-w-0 break-words font-medium">{supplier.name}</span>
        <div className="flex flex-wrap items-center gap-2 text-muted-foreground"><span>{score?.onTimePercent === null ? 'Not measured' : `${score?.onTimePercent}% on time`}</span><span>{score?.samples ?? 0} receipts</span><Badge variant="secondary">+{score?.safetyDays ?? 0} safety days</Badge></div>
      </div>;
    })}
    <Dialog open={open} onOpenChange={value => { if (!saving) setOpen(value); }}>
      <DialogContent className="max-h-[85dvh] max-w-4xl overflow-y-auto">
        <DialogHeader><DialogTitle>{formOpen ? (editing ? 'Edit supplier delivery' : 'Log supplier delivery') : 'Supplier delivery log'}</DialogTitle></DialogHeader>
        {formOpen ? <form onSubmit={save} className="space-y-4">
          <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={() => setFormOpen(false)}><ArrowLeft className="mr-2 h-4 w-4" />Delivery log</Button>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="delivery-supplier">Supplier</Label><Select value={draft.supplier_id || 'none'} onValueChange={value => change('supplier_id', value === 'none' ? '' : value)} disabled={saving}><SelectTrigger id="delivery-supplier"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Choose supplier</SelectItem>{suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><Label htmlFor="delivery-po">PO reference</Label><Input id="delivery-po" required maxLength={100} value={draft.purchase_order_number} onChange={e => change('purchase_order_number', e.target.value)} disabled={saving} /></div>
            <div className="space-y-2"><Label htmlFor="delivery-ordered">Ordered date</Label><Input id="delivery-ordered" type="date" required max={supplierToday()} value={draft.ordered_date} onChange={e => change('ordered_date', e.target.value)} disabled={saving} /></div>
            <div className="space-y-2"><Label htmlFor="delivery-expected">Expected delivery date</Label><Input id="delivery-expected" type="date" required min={draft.ordered_date} value={draft.expected_date} onChange={e => change('expected_date', e.target.value)} disabled={saving} /></div>
            <div className="space-y-2"><Label htmlFor="delivery-received">Fully received date (optional)</Label><Input id="delivery-received" type="date" min={draft.ordered_date} max={supplierToday()} value={draft.received_date ?? ''} onChange={e => change('received_date', e.target.value || null)} disabled={saving || draft.cancelled} /></div>
            <div className="flex items-center gap-2"><Checkbox id="delivery-cancelled" checked={draft.cancelled} disabled={saving} onCheckedChange={value => { change('cancelled', value === true); if (value === true) change('received_date', null); }} /><Label htmlFor="delivery-cancelled">Cancelled</Label></div>
          </div>
          <div className="space-y-2"><Label htmlFor="delivery-notes">Notes</Label><Textarea id="delivery-notes" value={draft.notes} onChange={e => change('notes', e.target.value)} disabled={saving} /></div>
          {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}
          <div className="flex justify-end"><Button type="submit" disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save delivery</Button></div>
        </form> : <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2"><Select value={filter} onValueChange={setFilter}><SelectTrigger className="w-full sm:w-72" aria-label="Filter supplier deliveries"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All suppliers</SelectItem>{suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select><Button size="sm" disabled={loading || !!error} onClick={() => start()}><Plus className="mr-2 h-4 w-4" />Log delivery</Button><Button variant="ghost" size="icon" aria-label="Refresh delivery log" onClick={() => void reload().catch(() => undefined)}><RefreshCw className="h-4 w-4" /></Button></div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {tracked.filter(s => filter === 'all' || filter === s.id).map(s => {
            const score = scores.get(s.id);
            return <div key={s.id} className="border-b border-border pb-3"><h4 className="break-words text-sm font-semibold">{s.name}</h4><div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground"><span>{score?.samples ?? 0} full receipts · last 365 days</span><span>{score?.onTimePercent == null ? 'On-time rate: unknown' : `${score.onTimePercent}% on time`}</span><span>Average lead: {score?.averageLeadDays ?? '—'} days</span><span>Average delay: {score?.averageDelayDays ?? '—'} days</span><Badge variant="secondary">+{score?.safetyDays ?? 0} safety days</Badge>{(score?.samples ?? 0) < 3 && <Badge variant="outline">Awaiting 3 receipts</Badge>}</div></div>;
          })}
          {visible.length === 0 && !loading && <p className="py-6 text-center text-sm text-muted-foreground">No supplier deliveries recorded.</p>}
          {visible.map(record => <div key={record.id} className="flex items-start justify-between gap-3 border-b border-border py-3">
            <div className="min-w-0"><p className="break-words text-sm font-medium">{names.get(record.supplier_id) ?? 'Unavailable supplier'} · {record.purchase_order_number}</p><div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"><span>Ordered {record.ordered_date}</span><span>Expected {record.expected_date}</span><span>Fully received {record.received_date ?? '—'}</span></div><Badge className="mt-2" variant={record.cancelled ? 'outline' : !record.received_date && record.expected_date < supplierToday() ? 'destructive' : 'secondary'}>{record.cancelled ? 'Cancelled' : record.received_date ? (record.received_date <= record.expected_date ? 'On time' : 'Late') : record.expected_date < supplierToday() ? 'Overdue' : 'Awaiting delivery'}</Badge>{record.notes && <p className="mt-2 whitespace-pre-wrap break-words text-xs text-muted-foreground">{record.notes}</p>}</div>
            <Button size="icon" variant="ghost" aria-label={`Edit delivery ${record.purchase_order_number}`} disabled={!!error} onClick={() => start(record)}><Pencil className="h-4 w-4" /></Button>
          </div>)}
        </div>}
      </DialogContent>
    </Dialog>
  </section>;
}