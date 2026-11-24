import { supabase } from '@/integrations/supabase/client';
import { readAllRows } from '@/lib/readAllRows';
import { readRowsByIds } from '@/lib/readRowsByIds';
import { orderItemBuckets, isActiveOrder, isFullyCompleted } from '@/lib/orderLifecycle';
import { isMyActiveWork, type WorkRow } from '@/lib/myWork';
import { queryActiveDispatch } from '@/services/dispatchDocuments';

export async function loadMyOrders(userId: string): Promise<WorkRow[]> {
  const orders = await readAllRows((from, to) => supabase.from('orders').select('id,order_number,company_id,status,completed_date,assigned_to,urgency').eq('assigned_to', userId).is('completed_date', null).order('id').range(from, to));
  const active = orders.filter(isActiveOrder);
  const [items, companies] = await Promise.all([
    readRowsByIds(active.map(o => o.id), (batch, from, to) => supabase.from('order_items').select('id,order_id,quantity,qty_on_po,qty_received,qty_invoiced,qty_completed').in('order_id', batch).order('id').range(from, to)),
    readRowsByIds(active.flatMap(o => o.company_id ? [o.company_id] : []), (batch, from, to) => supabase.from('companies').select('id,name').in('id', batch).order('id').range(from, to)),
  ]);
  const names = new Map(companies.map(c => [c.id, c.name]));
  return active.flatMap(order => {
    const lines = items.filter(i => i.order_id === order.id);
    if (isFullyCompleted(lines)) return [];
    const counters = lines.map(orderItemBuckets);
    const purchase = counters.reduce((sum, c) => sum + c['awaiting-stock'], 0);
    const waiting = counters.reduce((sum, c) => sum + c.ordered, 0);
    const invoice = counters.reduce((sum, c) => sum + c['in-stock'], 0);
    const ready = counters.reduce((sum, c) => sum + c['ready-for-delivery'], 0);
    const stages = [purchase ? `${purchase} to purchase` : '', waiting ? `${waiting} on PO` : '', invoice ? `${invoice} to invoice` : '', ready ? `${ready} ready for dispatch` : ''].filter(Boolean);
    return [{ id: order.id, title: order.order_number, subtitle: order.company_id ? names.get(order.company_id) ?? 'Unknown client' : 'No client', status: stages.join(' · ') || 'No item lines', priority: order.urgency, view: 'orders', entityType: 'order', category: 'orders' as const }];
  });
}

export async function loadMyWorkshop(userId: string): Promise<WorkRow[]> {
  const [sharpening, repairs, fabrication] = await Promise.all([
    readAllRows((from, to) => supabase.from('sharpening_jobs').select('id,job_number,customer_name,status,assigned_to,priority,deadline_date,completed_at').eq('assigned_to', userId).order('id').range(from, to)),
    readAllRows((from, to) => supabase.from('repair_tickets').select('id,ticket_number,client,status,assigned_to,priority,deadline_date,completed_at').eq('assigned_to', userId).order('id').range(from, to)),
    readAllRows((from, to) => supabase.from('fabrication_projects').select('id,project_number,name,client_name,stage,assigned_to,priority,due_date,completed_at').eq('assigned_to', userId).order('id').range(from, to)),
  ]);
  return [
    ...sharpening.filter(r => isMyActiveWork(r, userId)).map(r => ({ id: r.id, title: r.job_number, subtitle: r.customer_name, status: `Sharpening · ${r.status.replace(/_/g, ' ')}`, priority: r.priority, due: r.deadline_date, view: 'sharpening', entityType: 'sharpening', category: 'workshop' as const })),
    ...repairs.filter(r => isMyActiveWork(r, userId)).map(r => ({ id: r.id, title: r.ticket_number, subtitle: r.client, status: `Repair · ${r.status.replace(/_/g, ' ')}`, priority: r.priority, due: r.deadline_date, view: 'repairs', entityType: 'repairs', category: 'workshop' as const })),
    ...fabrication.filter(r => isMyActiveWork(r, userId)).map(r => ({ id: r.id, title: r.project_number || r.name, subtitle: r.client_name || r.name, status: `Fabrication · ${r.stage.replace(/_/g, ' ')}`, priority: r.priority, due: r.due_date, view: 'fabrication', category: 'workshop' as const })),
  ];
}

export async function loadMyDispatch(userId: string): Promise<WorkRow[]> {
  const [documents, routes] = await Promise.all([
    queryActiveDispatch(undefined, [userId]),
    readAllRows((from, to) => supabase.from('dispatch_routes').select('id,name,status,driver_id,route_date,completed_stops,total_stops').eq('driver_id', userId).order('route_date').order('id').range(from, to)),
  ]);
  if (documents.error) throw new Error(documents.error.message);
  return [
    ...(documents.data ?? []).map(d => ({ id: d.id, title: d.reference, subtitle: d.contact_name ?? '', status: `${d.kind === 'collection' ? 'Collection' : 'Delivery'} · ${d.status.replace(/_/g, ' ')}`, due: d.scheduled_for, view: 'fulfillment', entityType: d.kind, category: 'dispatch' as const })),
    ...routes.filter(r => isMyActiveWork(r, userId)).map(r => ({ id: r.id, title: r.name, subtitle: `${r.completed_stops ?? 0}/${r.total_stops ?? 0} stops completed`, status: `Route · ${r.status}`, due: r.route_date, view: 'fulfillment', category: 'dispatch' as const })),
  ];
}

export async function loadMyTasks(userId: string): Promise<WorkRow[]> {
  const [tasks, exceptions] = await Promise.all([
    readAllRows((from, to) => supabase.from('team_action_items').select('*').eq('assigned_to', userId).order('id').range(from, to)),
    readAllRows((from, to) => supabase.from('operations_exceptions').select('*').eq('assigned_to', userId).order('id').range(from, to)),
  ]);
  return [
    ...tasks.filter(r => isMyActiveWork(r, userId)).map(r => ({ id: r.id, title: r.title, subtitle: r.description ?? '', status: r.status, priority: r.priority, due: r.due_at, view: 'control-tower', category: 'tasks' as const })),
    ...exceptions.filter(r => isMyActiveWork(r, userId)).map(r => ({ id: r.id, title: r.title, subtitle: r.description ?? r.category, status: r.status, priority: r.severity, due: r.due_at, view: 'control-tower', category: 'tasks' as const })),
  ];
}