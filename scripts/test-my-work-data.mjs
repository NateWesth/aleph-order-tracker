import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';
function load(path, imports) {
  const source=readFileSync(new URL(path,import.meta.url),'utf8');
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  const exports={};vm.runInNewContext(js,{exports,require:name=>imports[name],console,Date,Map,Set});return exports;
}
const all=load('../src/lib/readAllRows.ts',{});
const ids=load('../src/lib/readRowsByIds.ts',{'@/lib/readAllRows':all});
const lifecycle=load('../src/lib/orderLifecycle.ts',{});
const rules=load('../src/lib/myWork.ts',{});
const tables={orders:[{id:'mine',order_number:'ORDER-1',assigned_to:'me',company_id:'client',status:'ordered',completed_date:null,urgency:'normal'},{id:'other',order_number:'ORDER-2',assigned_to:'other',status:'ordered',completed_date:null}],order_items:[{id:'line',order_id:'mine',quantity:10,qty_on_po:4,qty_received:0,qty_invoiced:0,qty_completed:0}],companies:[{id:'client',name:'Customer'}],sharpening_jobs:Array.from({length:1105},(_,i)=>({id:String(i),job_number:`JOB-${i}`,customer_name:'Customer',assigned_to:'me',status:'not_started',completed_at:null,priority:'normal'})),repair_tickets:[],fabrication_projects:[]};
let fail=false;
const db={from(table){let rows=[...(tables[table]??[])];return {select(){return this;},eq(key,value){rows=rows.filter(r=>r[key]===value);return this;},is(key,value){rows=rows.filter(r=>r[key]===value);return this;},in(key,values){assert.ok(values.length<=100);rows=rows.filter(r=>values.includes(r[key]));return this;},order(){return this;},range(from,to){return Promise.resolve(fail?{data:null,error:{message:'Read failed'}}:{data:rows.slice(from,to+1),error:null});}};}};
const service=load('../src/services/myWork.ts',{'@/integrations/supabase/client':{supabase:db},'@/lib/readAllRows':all,'@/lib/readRowsByIds':ids,'@/lib/orderLifecycle':lifecycle,'@/lib/myWork':rules,'@/services/dispatchDocuments':{}});
test('My Work reads over 1000 assigned workshop jobs without truncation',async()=>{
 const result=await service.loadMyWorkshop('me');assert.equal(result.length,1105);assert.equal(result.at(-1).title,'JOB-1104');
});
test('personal purchasing reflects actual assignments and stage quantities',async()=>{
 const result=await service.loadMyOrders('me');assert.equal(result.length,1);assert.equal(result[0].title,'ORDER-1');assert.equal(result[0].status,'6 awaiting stock · 4 on PO');
});
test('failed workshop reads reject instead of returning an empty workload',async()=>{
 fail=true;await assert.rejects(service.loadMyWorkshop('me'),/Read failed/);fail=false;
});
test('temporary coverage applies only to matching scopes and never duplicates the owner',async()=>{
 const covers=[{owner_id:'colleague',scopes:['workshop']},{owner_id:'unrelated',scopes:['dispatch']},{owner_id:'me',scopes:['all']}];
 const loader=async id=>[{id,title:id,subtitle:'Job',status:'active',category:'workshop',view:'sharpening'}];
 const result=await service.loadCoveredMyWork('me','workshop',loader,covers);
 assert.equal(result.length,2);assert.equal(result[0].title,'me');assert.equal(result[1].title,'colleague');assert.equal(result[1].subtitle,'Temporary cover · Job');
});