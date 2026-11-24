import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';
const source=await readFile(new URL('../supabase/functions/buying-sheet-refresh/rules.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
const rules=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
test('Buying Sheet refresh runs three times daily at 07:00, 12:00 and 17:00 SAST',()=>{
 assert.deepEqual(rules.BUYING_REFRESH_HOURS_SAST,[7,12,17]);assert.equal(rules.BUYING_REFRESH_CRON,'0 5,10,15 * * *');
});
test('public scheduler cannot repeat costly provider scans within four hours',()=>{
 const now=Date.parse('2026-11-24T10:00:00Z');assert.equal(rules.canStartRefresh('2026-11-24T09:00:00Z',now),false);assert.equal(rules.canStartRefresh('2026-11-24T05:00:00Z',now),true);
});
test('complete refresh is recorded only after every PO, invoice and stock page',()=>{
 assert.deepEqual(rules.nextRefreshPage('purchase_order',3,true),{source:'purchase_order',next_page:4,running:true});
 assert.deepEqual(rules.nextRefreshPage('purchase_order',4,false),{source:'invoice',next_page:1,running:true});
 assert.deepEqual(rules.nextRefreshPage('invoice',2,true),{source:'invoice',next_page:3,running:true});
  assert.deepEqual(rules.nextRefreshPage('invoice',3,false),{source:'inventory',next_page:1,running:true});
  assert.deepEqual(rules.nextRefreshPage('inventory',4,true),{source:'inventory',next_page:5,running:true});
  assert.deepEqual(rules.nextRefreshPage('inventory',5,false),{source:'purchase_order',next_page:1,running:false});
});