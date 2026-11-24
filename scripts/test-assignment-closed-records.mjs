import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

// Run with PGLITE_MODULE pointing to an isolated @electric-sql/pglite install.
const { PGlite } = await import(process.env.PGLITE_MODULE || "@electric-sql/pglite");
const initial = await readFile(new URL("../supabase/migrations/20261118052610_52b082bd-65b9-4f4f-8191-5ad287ccb5cc.sql", import.meta.url), "utf8");
const functionSQL = name => {
  const match = initial.match(new RegExp(`CREATE (?:OR REPLACE )?FUNCTION public\\.${name}\\([\\s\\S]*?END \\$\\$;`));
  if (!match) throw new Error(`Missing function ${name}`);
  return match[0];
};
const sync = await readFile(new URL("../supabase/migrations/20261124051349_9ca20cf3-f486-4537-aed7-5c3ea54f2126.sql", import.meta.url), "utf8");
const reconcile = await readFile(new URL("../supabase/migrations/20261124051755_e611348a-7e5f-4833-ae05-1de4fece0133.sql", import.meta.url), "utf8");

test("Client relinking and timed handover/restoration preserve every settled row exactly", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE public.companies(id uuid PRIMARY KEY, purchasing_invoicing_user_id uuid);
      CREATE TABLE public.orders(id text PRIMARY KEY, company_id uuid, assigned_to uuid, status text, completed_date timestamptz, fulfillment_assigned_to uuid, marker text);
      CREATE TABLE public.test_cover(delegate_id uuid);
      CREATE FUNCTION public.effective_operational_owner(owner_id uuid) RETURNS uuid LANGUAGE sql AS $$ SELECT coalesce((SELECT delegate_id FROM public.test_cover LIMIT 1), owner_id) $$;
      ${functionSQL("apply_client_operational_assignment")}
      CREATE TRIGGER assign_owner BEFORE UPDATE OF assigned_to ON public.orders FOR EACH ROW EXECUTE FUNCTION public.apply_client_operational_assignment();
      ${sync}
      ${reconcile}
      CREATE TRIGGER sync_owner AFTER UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.sync_client_operational_orders();
      INSERT INTO public.companies VALUES('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002');
      INSERT INTO public.orders VALUES
        ('open','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','ordered',NULL,'00000000-0000-0000-0000-000000000009','original'),
        ('delivered','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','delivered',NULL,NULL,'settled'),
        ('completed','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','completed',NULL,NULL,'settled'),
        ('cancelled','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','cancelled',NULL,NULL,'settled'),
        ('dated-complete','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','ready','2026-11-23',NULL,'settled');
    `);
    const settled = async () => (await db.query("SELECT * FROM public.orders WHERE id <> 'open' ORDER BY id")).rows;
    const before = await settled();
    await db.exec("UPDATE public.companies SET purchasing_invoicing_user_id='00000000-0000-0000-0000-000000000003';");
    assert.deepEqual(await settled(), before);
    assert.equal((await db.query("SELECT assigned_to FROM public.orders WHERE id='open'")).rows[0].assigned_to, "00000000-0000-0000-0000-000000000003");
    await db.exec("INSERT INTO public.test_cover VALUES('00000000-0000-0000-0000-000000000004'); SELECT public.reconcile_operational_leave_cover();");
    assert.deepEqual(await settled(), before);
    assert.equal((await db.query("SELECT assigned_to FROM public.orders WHERE id='open'")).rows[0].assigned_to, "00000000-0000-0000-0000-000000000004");
    await db.exec("TRUNCATE public.test_cover; SELECT public.reconcile_operational_leave_cover();");
    assert.deepEqual(await settled(), before);
    const open = (await db.query("SELECT * FROM public.orders WHERE id='open'")).rows[0];
    assert.equal(open.assigned_to, "00000000-0000-0000-0000-000000000003");
    assert.equal(open.fulfillment_assigned_to, "00000000-0000-0000-0000-000000000009");
  } finally { await db.close(); }
});