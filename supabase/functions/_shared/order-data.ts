// Keep this terminal-state rule aligned with src/lib/orderLifecycle.ts.
export function activeOrderQuery(query: any) {
  return query.is('completed_date', null).or('status.is.null,status.not.in.(completed,delivered,cancelled,canceled)');
}
export async function readOrderRows(build: (from: number, to: number) => PromiseLike<any>): Promise<any[]> {
  const rows: any[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await build(from, from + 499);
    if (error) throw new Error(error.message);
    rows.push(...(data || []));
    if (!data || data.length < 500) return rows;
  }
}
export async function readOrderRowsByIds(ids: string[], build: (ids: string[], from: number, to: number) => PromiseLike<any>) {
  const unique = [...new Set(ids)];
  const rows: any[] = [];
  for (let offset = 0; offset < unique.length; offset += 100) {
    rows.push(...await readOrderRows((from, to) => build(unique.slice(offset, offset + 100), from, to)));
  }
  return rows;
}
export async function activeOrderIds(db: any, ids: string[]) {
  const rows = await readOrderRowsByIds(ids, (batch, from, to) => activeOrderQuery(db.from('orders').select('id').in('id', batch)).order('id').range(from, to));
  return rows.map(row => row.id) as string[];
}
export async function readActiveOrderReport(db: any, fields: string) {
  return { data: await readOrderRows((from,to)=>activeOrderQuery(db.from('orders').select(fields)).order('id').range(from,to)) };
}
export async function readActiveOrderLines(db: any, table: 'order_items' | 'order_purchase_orders', fields: string) {
  const orders = await readActiveOrderReport(db, 'id');
  return { data: await readOrderRowsByIds(orders.data.map(o=>o.id),(batch,from,to)=>db.from(table).select(fields).in('order_id',batch).order('id').range(from,to)) };
}
export function requireOrderReportResults(results: PromiseSettledResult<any>[]) {
  for (const result of results) {
    if (result.status==='rejected') throw result.reason;
    if (result.value.error) throw new Error(result.value.error.message);
  }
}