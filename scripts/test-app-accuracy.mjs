import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import ts from 'typescript';
async function load(name) {
  const source = await readFile(new URL(`../src/lib/${name}.ts`, import.meta.url), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
  return import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
}
const { isActiveOrder, isOrderHistory, isFullyCompleted, orderItemBuckets } = await load('orderLifecycle');
const { buyingRequirement, buyingPOCoverage, createQuantityPool } = await load('buyingSheet');
const { isMyActiveWork, sortMyWork } = await load('myWork');
test('completed orders cannot remain in Awaiting Stock even when their old item counters are zero', () => {
  assert.equal(isActiveOrder({ status: 'completed' }), false);
  assert.equal(isActiveOrder({ status: 'ordered', completed_date: '2026-11-24' }), false);
  assert.equal(isOrderHistory({ status: 'completed' }), true);
  assert.equal(isOrderHistory({ status: 'ordered', completed_date: '2026-11-24' }), true);
});
test('partial completion does not send the entire order to history', () => {
  assert.equal(isFullyCompleted([{quantity:10,qty_completed:9}]), false);
  assert.equal(isFullyCompleted([{quantity:10,qty_completed:10}]), true);
  assert.equal(isFullyCompleted([]), false);
});
test('downstream saved counters never reappear as awaiting-stock units', () => {
  assert.deepEqual(orderItemBuckets({quantity:10,qty_completed:10}), {'awaiting-stock':0,ordered:0,'in-stock':0,'ready-for-delivery':0,completed:10});
  assert.deepEqual(orderItemBuckets({quantity:10,qty_received:4}), {'awaiting-stock':6,ordered:0,'in-stock':4,'ready-for-delivery':0,completed:0});
});
test('completed and invoiced units are never bought again', () => {
  assert.equal(buyingRequirement({quantity:10,qty_invoiced:7}).totalNeeded,3);
  assert.equal(buyingRequirement({quantity:10,qty_completed:10}).totalNeeded,0);
  assert.equal(buyingRequirement({quantity:10,progress_stage:'completed'}).totalNeeded,0);
});
test('open PO quantity already includes linked allocations and must not be doubled', () => {
  assert.equal(buyingPOCoverage(10,6,6),6);
  assert.equal(buyingPOCoverage(10,8,3),3);
  assert.equal(buyingPOCoverage(10,8,3,true),8);
});
test('open PO and inventory pools cover demand once across matching SKU rows', () => {
  const pool=createQuantityPool([['A',6]]);
  assert.equal(buyingPOCoverage(10,4,pool.take('A',10)),6);
  assert.equal(buyingPOCoverage(10,4,pool.take('A',10)),0);
});
test('My Work uses actual assignee, not creator or another users assignments', () => {
  assert.equal(isMyActiveWork({assigned_to:'me',status:'not_started'},'me'),true);
  assert.equal(isMyActiveWork({assigned_to:'other',status:'not_started'},'me'),false);
  assert.equal(isMyActiveWork({assigned_to:null,status:'not_started'},'me'),false);
});
test('completed workshop jobs and cancelled routes leave personal work', () => {
  assert.equal(isMyActiveWork({assigned_to:'me',status:'completed'},'me'),false);
  assert.equal(isMyActiveWork({assigned_to:'me',stage:'completed'},'me'),false);
  assert.equal(isMyActiveWork({driver_id:'me',status:'cancelled'},'me'),false);
  assert.equal(isMyActiveWork({driver_id:'me',status:'planned'},'me'),true);
});
test('all personal jobs remain listed, overdue work before urgent and normal', () => {
  const rows=Array.from({length:20},(_,i)=>({id:String(i),title:'Job',subtitle:'Client',status:'not_started',view:'repairs',category:'workshop'}));
  rows[0].priority='urgent'; rows[1].due='2026-11-20';
  const result=sortMyWork(rows,'2026-11-24');
  assert.equal(result.length,20); assert.equal(result[0].id,'1'); assert.equal(result[1].id,'0');
});