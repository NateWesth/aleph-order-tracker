import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import ts from 'typescript';
function load(path, imports={}) {
 const source=readFileSync(new URL(path,import.meta.url),'utf8');
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 const exports={};vm.runInNewContext(js,{exports,require:name=>imports[name],console,Map,Set,Date});return exports;
}
const helper=load('../supabase/functions/_shared/order-data.ts');
const quantity=load('../supabase/functions/zoho-webhook/quantity-flow.ts',{'../_shared/order-data.ts':helper});
const lifecycle=load('../src/lib/orderLifecycle.ts');
const closed=['completed','delivered','cancelled','canceled'];
function mock(tables) {
 const writes=[];let failure=false;
 return {writes,setFailure(){failure=true;},from(table){let rows=tables[table]||[];let patch;
 const q={select(){return q;},is(k,v){rows=rows.filter(r=>(r[k]??null)===v);return q;},or(){rows=rows.filter(r=>!closed.includes(r.status));return q;},in(k,ids){assert.ok(ids.length<=100);rows=rows.filter(r=>ids.includes(r[k]));return q;},eq(k,v){rows=rows.filter(r=>r[k]===v);return q;},ilike(k,v){rows=rows.filter(r=>String(r[k]).toLowerCase()===v.toLowerCase());return q;},order(){return q;},update(v){patch=v;return q;},insert(){return q;},range(from,to){return Promise.resolve({data:rows.slice(from,to+1),error:failure?{message:'Connection lost'}:null});},maybeSingle(){return Promise.resolve({data:rows[0]||null,error:null});},then(resolve,reject){if(patch)for(const row of rows){writes.push({table,id:row.id,...patch});Object.assign(row,patch);}return Promise.resolve({data:rows,error:null}).then(resolve,reject);}};return q;}};
}
test('reports and frontend agree on all closed states and a saved completion date',async()=>{
 const orders=[...closed.map((status,i)=>({id:String(i),status,completed_date:null})),{id:'dated',status:'ordered',completed_date:'2026-10-02'},{id:'active',status:null,completed_date:null}];
 const db=mock({orders});const result=await helper.readActiveOrderReport(db,'*');
 assert.equal(result.data.length,1);assert.equal(result.data[0].id,'active');
 for(const row of orders)assert.equal(lifecycle.isActiveOrder(row),row.id==='active');
});
test('report reads include 1201 open orders, not just the first 500 or 1000',async()=>{
 const db=mock({orders:Array.from({length:1201},(_,i)=>({id:String(i),status:'ordered',completed_date:null}))});
 assert.equal((await helper.readActiveOrderReport(db,'*')).data.length,1201);
});
test('report lines are active-order-scoped and batch-paginated',async()=>{
 const db=mock({orders:[{id:'open',status:'ordered'},{id:'closed',status:'completed'}],order_items:[...Array.from({length:1105},(_,i)=>({id:String(i),order_id:'open'})),{id:'historic',order_id:'closed'}]});
 const result=await helper.readActiveOrderLines(db,'order_items','*');assert.equal(result.data.length,1105);assert.ok(result.data.every(r=>r.order_id==='open'));
});
test('failed report reads stop the report instead of inventing an empty workload',async()=>{
 const db=mock({orders:[]});db.setFailure();await assert.rejects(helper.readActiveOrderReport(db,'*'),/Connection lost/);
 assert.throws(()=>helper.requireOrderReportResults([{status:'fulfilled',value:{error:{message:'Read failed'}}}]),/Read failed/);
});
test('later invoices cannot change settled order lines',async()=>{
 const db=mock({orders:[{id:'closed',status:'completed'},{id:'dated',status:'ordered',completed_date:'2026-10-02'}],order_items:[{id:'a',order_id:'closed',code:'SKU',quantity:5},{id:'b',order_id:'dated',code:'SKU',quantity:5}]});
 const result=await quantity.applyInvoiceQuantities(db,['closed','dated'],[{sku:'SKU',quantity:10}]);assert.equal(result.updated,0);assert.equal(db.writes.length,0);
});
test('invoice updates include all matching active lines beyond row caps',async()=>{
 const db=mock({orders:[{id:'open',status:'ordered'}],order_items:Array.from({length:1105},(_,i)=>({id:String(i),order_id:'open',code:'SKU',quantity:1,qty_invoiced:0,qty_on_po:0,qty_received:0}))});
 const result=await quantity.applyInvoiceQuantities(db,['open'],[{sku:'SKU',quantity:1105}]);assert.equal(result.updated,1105);assert.equal(db.writes.length,1105);
});
test('later vendor receipts cannot edit a closed job or its allocations',async()=>{
 const db=mock({orders:[{id:'closed',status:'delivered'}],order_items:[{id:'line',order_id:'closed',qty_received:0,qty_on_po:5}],order_item_po_allocations:[{id:'allocation',order_item_id:'line',quantity_ordered:5,quantity_received:0,zoho_purchaseorder_id:'PO',sku:'sku'}]});
 const result=await quantity.applyBillReceipt(db,{purchaseorder_id:'PO',line_items:[{sku:'SKU',quantity:5}]});assert.equal(result.received,0);assert.equal(db.writes.length,0);
});
test('unsafe rebuild gives an explicit failure before any write or network call',async()=>{
 const source=readFileSync(new URL('../supabase/functions/zoho-webhook/index.ts',import.meta.url),'utf8');
 const fn=source.slice(source.indexOf('async function handleReconcileQuantities('));
 const js=ts.transpileModule(fn,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText;
 const context={Response,JSON,corsHeaders:{}};vm.createContext(context);vm.runInContext(js,context);
 const db={from(){throw new Error('No writes allowed');}};
 const response=await context.handleReconcileQuantities(db,'unused','unused');assert.equal(response.status,409);assert.match((await response.json()).error,/erase confirmed stock/);
});