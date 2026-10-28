import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const src = readFileSync(new URL('../supabase/functions/rep-commission-data/costMatching.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const { costKeys, resolveBillCost } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
test('numeric SKU matches different sales and purchase descriptions', () => {
  const bill = { sku: '001234', name: 'Vendor bolt', description: 'Purchase wording' };
  const history = new Map(costKeys(bill).map(key => [key, [{ date: '2026-09-01', rate: 12 }]]));
  assert.equal(resolveBillCost(costKeys({ sku: '001234', name: 'Bolt', description: 'Sales wording' }), history, '2026-09-10'), 12);
  assert.equal(resolveBillCost(costKeys({ sku: '1234', name: 'Other bolt' }), history, '2026-09-10'), null);
});
test('shared miscellaneous product never shares its SKU or item ID cost', () => {
  assert.deepEqual(costKeys({ sku: 'M-Miscellaneous', item_id: '123', name: 'Custom', description: 'Welding' }), ['custom||welding', 'desc:welding']);
});
test('stable item ID works when bill omits SKU', () => {
  const history = new Map([['id:123', [{ date: '2026-09-01', rate: 18 }]]]);
  assert.equal(resolveBillCost(costKeys({ item_id: '123', name: 'Bolt' }), history, '2026-09-10'), 18);
});
test('exact text takes priority and cost is selected as of invoice date', () => {
  const line = { sku: '001234', name: 'Bolt', description: 'M10' };
  const history = new Map([['bolt||m10', [{ date: '2026-10-01', rate: 20 }, { date: '2026-09-01', rate: 10 }]], ['sku:001234', [{ date: '2026-09-01', rate: 99 }]]]);
  assert.equal(resolveBillCost(costKeys(line), history, '2026-09-15'), 10);
});
test('N/A name does not block a valid SKU', () => {
  const history = new Map([['sku:f1641-102530', [{ date: '2026-09-01', rate: 0.25 }]]]);
  assert.equal(resolveBillCost(costKeys({ name: 'N/A', sku: 'F1641-102530' }), history, '2026-09-29'), 0.25);
});
test('Zoho empty object item_code cannot become a shared product key', () => {
  assert.equal(costKeys({ name: 'Bolt', item_code: {} }).some(key => key.startsWith('sku:')), false);
});
test('miscellaneous cost matches only the exact sales description across names', () => {
  const history = new Map(costKeys({ name: 'M-Miscellaneous', description: 'Welding repair' }).map(key => [key, [{ date: '2026-09-01', rate: 100 }]]));
  assert.equal(resolveBillCost(costKeys({ name: 'N/A', sku: 'M-Miscellaneous', description: 'Welding repair' }), history, '2026-09-10'), 100);
  assert.equal(resolveBillCost(costKeys({ name: 'N/A', sku: 'M-Miscellaneous', description: 'Different repair' }), history, '2026-09-10'), null);
});