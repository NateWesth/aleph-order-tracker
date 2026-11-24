import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';
const require = createRequire(new URL('../tests/workflow-safety/package.json', import.meta.url));
const { PGlite } = require('@electric-sql/pglite');
const db = new PGlite();
const staff = '11111111-1111-1111-1111-111111111111';
const otherStaff = '22222222-2222-2222-2222-222222222222';
const unapproved = '33333333-3333-3333-3333-333333333333';
const admin = '44444444-4444-4444-4444-444444444444';
const vendor = '55555555-5555-5555-5555-555555555555';
await db.exec(`
 CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 CREATE TABLE public.profiles(id uuid PRIMARY KEY,approved boolean);
 CREATE TABLE public.user_roles(user_id uuid,role text);
 CREATE TABLE public.suppliers(id uuid PRIMARY KEY);
 CREATE FUNCTION public.is_user_approved(user_uuid uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ SELECT coalesce((SELECT approved FROM profiles WHERE id=user_uuid),false) $$;
 CREATE FUNCTION public.has_role(user_uuid uuid,requested_role text) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ SELECT exists(SELECT 1 FROM user_roles WHERE user_id=user_uuid AND role=requested_role) $$;
 GRANT USAGE ON SCHEMA public,auth TO authenticated;
`);
const directory = new URL('../supabase/migrations/', import.meta.url);
for (const name of (await readdir(directory)).sort()) {
  if (!name.startsWith('20261124074237')) continue;
  const sql = await readFile(new URL(name, directory), 'utf8');
  await db.exec(sql.replace('ALTER PUBLICATION supabase_realtime ADD TABLE public.supplier_delivery_tracking;', ''));
}
await db.query('INSERT INTO profiles VALUES($1,true),($2,true),($3,false),($4,false)', [staff, otherStaff, unapproved, admin]);
await db.query('INSERT INTO user_roles VALUES($1,\'admin\')', [admin]);
await db.query('INSERT INTO suppliers VALUES($1)', [vendor]);
const become = async user => { await db.exec('RESET ROLE'); await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [user]); await db.exec('SET ROLE authenticated'); };
const insert = (reference, expected = '2026-01-08', received = '2026-01-09') => db.query(`INSERT INTO supplier_delivery_tracking(supplier_id,purchase_order_number,ordered_date,expected_date,received_date) VALUES($1,$2,'2026-01-01',$3,$4) RETURNING *`, [vendor, reference, expected, received]);
let saved;
test('approved staff can save real supplier delivery dates and see them under a second staff identity', async () => {
  await become(staff); saved = (await insert(' po-1 ')).rows[0];
  assert.equal(saved.purchase_order_number, 'PO-1'); assert.equal(saved.created_by, staff);
  await become(otherStaff);
  assert.equal((await db.query('SELECT * FROM supplier_delivery_tracking')).rows[0].id, saved.id);
});
test('unapproved users cannot read or submit supplier performance records', async () => {
  await become(unapproved);
  assert.equal((await db.query('SELECT * FROM supplier_delivery_tracking')).rows.length, 0);
  await assert.rejects(insert('DENIED'), /row-level security/);
});
test('approved staff cannot delete shared delivery history; admins can', async () => {
  await become(staff); assert.equal((await db.query('DELETE FROM supplier_delivery_tracking WHERE id=$1 RETURNING id', [saved.id])).rows.length, 0);
  await become(admin); const temp = (await insert('ADMIN-DELETE')).rows[0];
  assert.equal((await db.query('DELETE FROM supplier_delivery_tracking WHERE id=$1 RETURNING id', [temp.id])).rows.length, 1);
});
test('database rejects impossible delivery chronology and duplicate normalized PO references', async () => {
  await become(staff);
  await assert.rejects(insert('EARLY-EXPECTED', '2025-12-31'), /Expected date cannot precede/);
  await assert.rejects(insert('EARLY-RECEIVED', '2026-01-08', '2025-12-31'), /Fully received date/);
  await assert.rejects(insert('FUTURE-RECEIVED', '2026-01-08', '2099-01-01'), /Fully received date/);
  await assert.rejects(insert('po-1'), /duplicate key/);
});
test('corrections preserve original creator and attribute the latest editor', async () => {
  await become(otherStaff);
  const row = (await db.query('UPDATE supplier_delivery_tracking SET notes=$1,created_by=$2 WHERE id=$3 RETURNING *', ['Corrected receipt', otherStaff, saved.id])).rows[0];
  assert.equal(row.created_by, staff); assert.equal(row.updated_by, otherStaff);
});
test('timestamp checked edits reject stale changes rather than overwriting a colleague', async () => {
  await become(staff);
  const result = await db.query('UPDATE supplier_delivery_tracking SET notes=$1 WHERE id=$2 AND updated_at=$3 RETURNING id', ['Stale correction', saved.id, saved.updated_at]);
  assert.equal(result.rows.length, 0);
});
test.after(async () => db.close());