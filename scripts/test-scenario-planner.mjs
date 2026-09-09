import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { test } from "node:test";
import ts from "typescript";

async function source(file) {
  const text = await readFile(new URL("../src/lib/" + file, import.meta.url), "utf8");
  const js = ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
}
const { simulateSupplierDelay, dayNumber, openPO, parsePOCache } = await source("scenarioPlanner.ts");
const { readAllRows } = await source("readAllRows.ts");
const po = (id, date, vendor = "a") => ({ purchaseOrderId:id,purchaseOrderNumber:id,vendorId:vendor,vendorName:vendor,expectedDeliveryDate:date,status:"open",lines:[{quantity:10,quantityReceived:0,outstanding:10}] });
const order = (id, extra={}) => ({ id,order_number:id,status:"pending",completed_date:null,company_id:"client",customer:"Client",urgency:"normal",fulfillment_scheduled_for:"2026-09-18",...extra });
const options = {vendor:"a",delayDays:7,handlingDays:0,today:"2026-09-08"};
const run = (pos, overrides={}, orders=[order("SO1")], links=pos.map(p=>({order_id:"SO1",purchase_order_number:p.purchaseOrderNumber}))) =>
  simulateSupplierDelay(pos, orders, links, {...options,...overrides});

test("single supplier delay and target lateness",()=>{
  const row=run([po("PO1","2026-09-15")]).results[0];
  assert.equal(row.baseline,"2026-09-15");assert.equal(row.projected,"2026-09-22");assert.equal(row.shiftDays,7);assert.equal(row.lateDays,4);
});
test("later supplier absorbs delay; use the critical dependency",()=>{
  const row=run([po("PO1","2026-09-10"),po("PO2","2026-09-25","b")]).results[0];
  assert.equal(row.projected,"2026-09-25");assert.equal(row.shiftDays,0);
});
test("partial critical path shift",()=>assert.equal(run([po("A","2026-09-15"),po("B","2026-09-18","b")]).results[0].shiftDays,4));
test("handling time and calendar month rollover",()=>assert.equal(run([po("A","2026-09-29")],{handlingDays:2}).results[0].projected,"2026-10-08"));
test("missing and overdue dates are unknown, never invented",()=>{
  for(const date of [null,"2026-03-09","invalid"]) {const row=run([po("A",date)]).results[0];assert.equal(row.projected,null);assert.equal(row.unknownDates,1);}
});
test("explicit assumption resolves selected supplier only",()=>{
  assert.equal(run([po("A",null)],{assumedArrival:"2026-09-15"}).results[0].projected,"2026-09-22");
  assert.equal(run([po("A",null),po("B",null,"b")],{assumedArrival:"2026-09-15"}).results[0].projected,null);
});
test("past assumption cannot produce a false valid ETA",()=>assert.equal(run([po("A",null)],{assumedArrival:"2026-03-09"}).results[0].projected,null));
test("completed and cancelled orders excluded",()=>{
  for(const status of ["completed","delivered","cancelled"])assert.equal(run([po("A","2026-09-15")],{},[order("SO1",{status})]).results.length,0);
  assert.equal(run([po("A","2026-09-15")],{},[order("SO1",{completed_date:"2026-09-07"})]).results.length,0);
});
test("closed, void and received POs excluded",()=>{
  for(const status of ["closed","void","draft","cancelled"])assert.equal(openPO({...po("A",null),status}),false);
  assert.equal(openPO({...po("A",null),lines:[{quantity:10,quantityReceived:10}]}),false);
});
test("duplicate links do not double-count; reference trim and case tolerated",()=>{
  const row=run([po("PO1","2026-09-15")],{},[order("SO1")],[{order_id:"SO1",purchase_order_number:" po1 "},{order_id:"SO1",purchase_order_number:"PO1"}]).results[0];
  assert.equal(row.affectedPOs.length,1);
});
test("unlinked POs are explicitly reported",()=>assert.equal(run([po("A",null)],{},[],[]).unlinked.length,1));
test("a linked PO missing from the snapshot makes the projection uncertain",()=>{
  const row=run([po("A","2026-09-15")],{},[order("SO1")],[{order_id:"SO1",purchase_order_number:"A"},{order_id:"SO1",purchase_order_number:"MISSING"}]).results[0];
  assert.equal(row.projected,null);assert.equal(row.unknownDates,1);
});
test("simulation target overrides do not write scheduled date",()=>{
  const input=order("SO1"); const before=JSON.stringify(input);
  const row=run([po("A","2026-09-15")],{commitmentOverrides:{SO1:"2026-09-30"}},[input]).results[0];
  assert.equal(row.commitmentSource,"simulation");assert.equal(row.lateDays,0);assert.equal(JSON.stringify(input),before);
});
test("SAST date boundaries and invalid timestamps",()=>{
  assert.equal(dayNumber("2026-09-08T23:30:00Z"),dayNumber("2026-09-09"));
  for(const date of ["notTvalid","2026-02-30","",null])assert.equal(dayNumber(date),null);
});
test("input boundaries reject impossible scenarios",()=>{
  for(const delayDays of [-1,91,1.5,NaN])assert.throws(()=>run([po("A",null)],{delayDays}));
});
test("bad snapshot format raises a visible error",()=>{
  assert.throws(()=>parsePOCache({}));assert.throws(()=>parsePOCache([{}]));
});
test("pagination fetches beyond the 1000-row default cap",async()=>{
  const all=Array.from({length:1201},(_,i)=>i);const ranges=[];
  const rows=await readAllRows(async(from,to)=>{ranges.push([from,to]);return{data:all.slice(from,to+1),error:null}});
  assert.equal(rows.length,1201);assert.deepEqual(ranges,[[0,499],[500,999],[1000,1499]]);
});
test("pagination errors and aborts never become healthy empty data",async()=>{
  await assert.rejects(()=>readAllRows(async()=>({data:null,error:{message:"denied"}})),/denied/);
  const controller=new AbortController();controller.abort();
  await assert.rejects(()=>readAllRows(async()=>{throw Error("must not fetch")},controller.signal),{name:"AbortError"});
});
