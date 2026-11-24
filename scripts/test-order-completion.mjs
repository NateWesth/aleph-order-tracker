import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { test } from 'node:test';
const require = createRequire(new URL('../tests/workflow-safety/package.json', import.meta.url));
const { PGlite } = require('@electric-sql/pglite');
const db = new PGlite();
await db.exec(`
 CREATE ROLE anon; CREATE ROLE authenticated;
 CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
 CREATE TABLE orders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),status text,completed_date timestamptz,updated_at timestamptz DEFAULT now(),created_at timestamptz DEFAULT now(),assigned_to uuid,fulfillment_status text);
 CREATE TABLE order_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_id uuid REFERENCES orders(id),quantity integer,qty_on_po integer DEFAULT 0,qty_received integer DEFAULT 0,qty_invoiced integer DEFAULT 0,qty_completed integer DEFAULT 0,progress_stage text DEFAULT 'awaiting-stock',stock_status text DEFAULT 'awaiting',completed_at timestamptz,completed_by uuid);
 INSERT INTO orders(id,status,completed_date,assigned_to,fulfillment_status) VALUES ('11111111-1111-1111-1111-111111111111','delivered','2026-10-02','22222222-2222-2222-2222-222222222222','on-route');
 INSERT INTO order_items(order_id,quantity) VALUES('11111111-1111-1111-1111-111111111111',10);
`);
const initial = await readFile(new URL('../supabase/migrations/20260805123904_440a3e9b-b39c-4250-b3e5-c9b3ecd90edf.sql', import.meta.url),'utf8');
await db.exec(initial.slice(initial.indexOf('CREATE OR REPLACE FUNCTION public.sync_order_item_stage_from_quantities()')));
const stamps = await readFile(new URL('../supabase/migrations/20260225051330_25f5cb10-00a0-414a-815e-43bc092b8b86.sql', import.meta.url),'utf8');
await db.exec(stamps.slice(stamps.indexOf('CREATE OR REPLACE FUNCTION public.set_order_item_completed_at()')));
const migrations = new URL('../supabase/migrations/', import.meta.url);
for (const name of (await readdir(migrations)).sort()) if (name.startsWith('20261124075120') || name.startsWith('20261124075508')) await db.exec(await readFile(new URL(name,migrations),'utf8'));
const newOrder = async () => (await db.query("INSERT INTO orders(status,fulfillment_status) VALUES('ordered','pending') RETURNING id")).rows[0].id;
test('already delivered orders have no unfinished item records, retain dates and do not confirm driver stops', async () => {
  const item=(await db.query('SELECT * FROM order_items')).rows[0];
  assert.equal(item.qty_completed,10); assert.equal(item.progress_stage,'completed');
  assert.equal(item.completed_at.toISOString(),'2026-10-02T00:00:00.000Z');
  const order=(await db.query('SELECT * FROM orders')).rows[0];
  assert.equal(order.completed_date.toISOString(),'2026-10-02T00:00:00.000Z');
  assert.equal(order.assigned_to,'22222222-2222-2222-2222-222222222222');
  assert.equal(order.fulfillment_status,'on-route');
});
test('last item completion automatically moves the whole order to history, partial completion does not', async () => {
  const orderId=await newOrder();
  const items=(await db.query('INSERT INTO order_items(order_id,quantity) VALUES($1,5),($1,7) RETURNING id',[orderId])).rows;
  await db.query("UPDATE order_items SET progress_stage='completed' WHERE id=$1",[items[0].id]);
  assert.equal((await db.query('SELECT status FROM orders WHERE id=$1',[orderId])).rows[0].status,'ordered');
  await db.query("UPDATE order_items SET progress_stage='completed' WHERE id=$1",[items[1].id]);
  const row=(await db.query('SELECT * FROM orders WHERE id=$1',[orderId])).rows[0];
  assert.equal(row.status,'delivered'); assert.ok(row.completed_date); assert.equal(row.fulfillment_status,'pending');
});
test('counter-based completion also archives without an extra page visit', async () => {
  const id=await newOrder();
  await db.query('INSERT INTO order_items(order_id,quantity,qty_on_po,qty_received,qty_invoiced,qty_completed) VALUES($1,3,3,3,3,3)',[id]);
  assert.equal((await db.query('SELECT status FROM orders WHERE id=$1',[id])).rows[0].status,'delivered');
});
test('whole-order completion fills every item counter consistently', async () => {
  const id=await newOrder();
  await db.query('INSERT INTO order_items(order_id,quantity) VALUES($1,4)',[id]);
  await db.query("UPDATE orders SET status='delivered',completed_date='2026-11-24' WHERE id=$1",[id]);
  const item=(await db.query('SELECT * FROM order_items WHERE order_id=$1',[id])).rows[0];
  assert.deepEqual([item.qty_on_po,item.qty_received,item.qty_invoiced,item.qty_completed],[4,4,4,4]);
});
test('cancelled and empty orders never auto-complete from item changes', async () => {
  const id=await newOrder(); await db.query("UPDATE orders SET status='cancelled' WHERE id=$1",[id]);
  await db.query("INSERT INTO order_items(order_id,quantity,progress_stage) VALUES($1,1,'completed')",[id]);
  assert.equal((await db.query('SELECT status FROM orders WHERE id=$1',[id])).rows[0].status,'cancelled');
  const empty=await newOrder(); await db.query('INSERT INTO order_items(order_id,quantity) VALUES($1,0)',[empty]);
  assert.equal((await db.query('SELECT status FROM orders WHERE id=$1',[empty])).rows[0].status,'ordered');
});
test('completion trigger helpers cannot be called directly by signed-in users', async () => {
  const result=(await db.query("SELECT has_function_privilege('authenticated','public.complete_order_from_item_counters()','EXECUTE') as allowed")).rows[0];
  assert.equal(result.allowed,false);
});
test.after(async()=>db.close());