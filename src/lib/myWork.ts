export type WorkRow = { id: string; title: string; subtitle: string; status: string; priority?: string | null; due?: string | null; view: string; entityType?: string; category: 'orders' | 'workshop' | 'dispatch' | 'tasks' };
export function isMyActiveWork(row: { assigned_to?: string | null; driver_id?: string | null; status?: string | null; stage?: string | null; completed_at?: string | null; completed_date?: string | null }, userId: string) {
  return (row.assigned_to ?? row.driver_id) === userId && !row.completed_at && !row.completed_date && !['completed', 'delivered', 'cancelled', 'canceled', 'done', 'resolved', 'scrapped'].includes((row.status ?? row.stage ?? '').toLowerCase());
}
export function sortMyWork(rows: WorkRow[], today: string) {
  const rank = (r: WorkRow) => r.due && r.due.slice(0, 10) < today ? 0 : ['critical', 'urgent', 'high'].includes(r.priority ?? '') ? 1 : 2;
  return [...rows].sort((a, b) => rank(a) - rank(b) || (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.id.localeCompare(b.id));
}