import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { mergeInventory, readStock } from '../supabase/functions/_shared/inventory.ts';

const source = (await readFile(new URL('../supabase/functions/buying-sheet-data/index.ts', import.meta.url), 'utf8')).replace(/^import .*\n/gm, '');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
async function exercise({ approved = true, authorization = true, failPage = false, busy = false } = {}) {
  let handler;
  let saved = null;
  let pageCalls = 0;
  const released = [];
  const payload = { A: { stockOnHand: 3, unitCost: 115.95, vendorName: 'Supplier', onPurchaseOrder: 9 } };
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'test-user' } } }) },
    rpc: async (name, args) => {
      if (name === 'is_user_approved') { assert.deepEqual(args, { user_uuid: 'test-user' }); return { data: approved }; }
      if (name === 'has_role') return { data: false };
      if (name === 'try_acquire_zoho_sync_lock') return { data: !busy };
      if (name === 'release_zoho_sync_lock') { released.push(args.requested_key); return {}; }
      throw new Error(`Unexpected RPC: ${name}`);
    },
    from: (name) => {
      const chain = {
        select: () => chain, eq: () => chain,
        maybeSingle: async () => ({ data: { payload: saved?.payload || payload, fetched_at: '2026-08-19T00:00:00Z' } }),
        single: async () => ({ data: { organization_id: 'test-org', access_token: 'test-token', expires_at: '2099-01-01' } }),
        upsert: async (value) => { assert.equal(name, 'buying_sheet_cache'); saved = value; return {}; },
      };
      return chain;
    },
  };
  const mockFetch = async (url) => {
    assert.ok(url.includes('/items?'), 'Inventory refresh must not read bills or POs');
    pageCalls++;
    if (failPage && pageCalls === 2) return new Response('Zoho unavailable', { status: 504 });
    return Response.json({ code: 0, items: [{ sku: pageCalls === 1 ? 'A' : 'B', stock_on_hand: 20, name: 'Item' }], page_context: { has_more_page: pageCalls === 1 } });
  };
  const deno = { env: { get: () => 'test-only' }, serve: fn => { handler = fn; } };
  new Function('Deno', 'createClient', 'mergeInventory', 'readStock', 'fetch', js)(deno, () => client, mergeInventory, readStock, mockFetch);
  const response = await handler(new Request('https://example.test', { method: 'POST', headers: authorization ? { Authorization: 'Bearer test-only' } : {}, body: JSON.stringify({ action: 'refresh_inventory' }) }));
  return { response, body: await response.json(), saved, pageCalls, released };
}
const good = await exercise();
assert.equal(good.body.inventoryRefreshed, true);
assert.equal(good.pageCalls, 2);
assert.equal(good.saved.payload.A.stockOnHand, 20);
assert.equal(good.saved.payload.A.unitCost, 115.95);
assert.equal(good.saved.payload.A.onPurchaseOrder, 9);
assert.equal(good.body.data.A.stockUpdatedAt, good.saved.payload.A.stockUpdatedAt);
assert.deepEqual(good.released.sort(), ['buying-sheet-bootstrap', 'zoho-event-cache-mutation']);
const denied = await exercise({ approved: false });
assert.equal(denied.response.status, 403);
assert.equal(denied.pageCalls, 0);
assert.equal((await exercise({ authorization: false })).response.status, 401);
const partial = await exercise({ failPage: true });
assert.equal(partial.body.stale, true);
assert.equal(partial.saved, null);
assert.equal(partial.body.data.A.stockOnHand, 3);
assert.ok(partial.body.warning.includes('504'));
const busy = await exercise({ busy: true });
assert.equal(busy.response.status, 409);
assert.equal(busy.saved, null);
console.log('Inventory refresh authorization, pagination, readback, failure retention and lock tests passed');