import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import ts from 'typescript';
const source = await readFile(new URL('../src/lib/supplierReliability.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { scoreSupplierDeliveries: score, deliveryDateError, supplierSafetyStock, resolveSupplier } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
const today = '2026-11-24';
const record = (received, changes = {}) => ({ id: received || 'pending', supplier_id: 'a', purchase_order_number: 'PO1', ordered_date: '2026-11-01', expected_date: '2026-11-08', received_date: received, cancelled: false, notes: '', updated_at: '', ...changes });
test('on-time reliability compares expected against actual full delivery, not average duration', () => {
  const result = score([record('2026-11-07'), record('2026-11-08'), record('2026-11-12')], today);
  assert.equal(result.onTimePercent, 67); assert.equal(result.averageLeadDays, 8); assert.equal(result.safetyDays, 4);
});
test('three full deliveries are required before automatic safety adjustment', () => {
  assert.equal(score([record('2026-11-12'), record('2026-11-12')], today).safetyDays, 0);
  assert.equal(score([record('2026-11-12'), record('2026-11-12'), record('2026-11-12')], today).safetyDays, 4);
});
test('pending deliveries are overdue but do not invent reliability or lead time', () => {
  assert.deepEqual(score([record(null)], today), { samples: 0, onTimePercent: null, averageLeadDays: null, averageDelayDays: null, safetyDays: 0, overdue: 1 });
});
test('cancelled and receipts older than 365 days do not influence scoring', () => {
  assert.equal(score([record(null, { cancelled: true }), record('2025-11-20', { ordered_date: '2025-11-01', expected_date: '2025-11-08' })], today).samples, 0);
  assert.equal(score([record(null, { cancelled: true })], today).overdue, 0);
});
test('safety days cover the nearest-rank 90th percentile delay', () => {
  const items = Array.from({ length: 10 }, (_, i) => record(i < 8 ? '2026-11-08' : i === 8 ? '2026-11-10' : '2026-11-18'));
  assert.equal(score(items, today).safetyDays, 2);
});
test('delay buffer is bounded at thirty days', () => {
  const items = Array.from({ length: 3 }, () => record('2026-11-24', { ordered_date: '2026-09-01', expected_date: '2026-09-08' }));
  assert.equal(score(items, today).safetyDays, 30);
});
test('supplier delay days increase reorder safety units using daily demand', () => {
  assert.equal(supplierSafetyStock(3, 2.5, 4), 13);
  assert.equal(supplierSafetyStock(3, 2.5, 0), 3);
});
test('early receipts never create negative buffers', () => {
  assert.equal(score(Array.from({length: 3}, () => record('2026-11-02')), today).safetyDays, 0);
});
test('invalid date sequences cannot enter supplier scoring', () => {
  assert.ok(deliveryDateError(record('2026-10-31'), today));
  assert.ok(deliveryDateError(record('2026-11-25'), today));
  assert.ok(deliveryDateError(record(null, { expected_date: '2026-10-31' }), today));
  assert.ok(deliveryDateError(record('2026-11-08', { cancelled: true }), today));
  assert.ok(deliveryDateError(record(null, { ordered_date: '2026-02-30' }), today));
  assert.equal(score([record('2026-10-31')], today).samples, 0);
});
test('a changed suggested supplier never inherits the old supplier history', () => {
  const suppliers = [{ id: 'a', name: 'Old Supplier' }, { id: 'b', name: 'New Supplier' }];
  assert.equal(resolveSupplier(suppliers, ' New   Supplier ', 'a')?.id, 'b');
  assert.equal(resolveSupplier(suppliers, 'Unknown Supplier', 'a'), undefined);
});
test('ambiguous supplier names need the matching stable local identity', () => {
  const suppliers = [{ id: 'a', name: 'Supplier' }, { id: 'b', name: 'Supplier' }];
  assert.equal(resolveSupplier(suppliers, 'Supplier'), undefined);
  assert.equal(resolveSupplier(suppliers, 'Supplier', 'b')?.id, 'b');
});