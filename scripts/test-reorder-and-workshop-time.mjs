import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { test } from "node:test";
import ts from "typescript";

async function load(path) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  let js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  if (js.includes('"./readAllRows"')) {
    const pagingSource = await readFile(new URL("../src/lib/readAllRows.ts", import.meta.url), "utf8");
    const paging = ts.transpileModule(pagingSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
    js = js.replace('"./readAllRows"', JSON.stringify("data:text/javascript;base64," + Buffer.from(paging).toString("base64")));
  }
  return import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
}
const { resolveReorderLines, loadReorderDetails, readOrderItemsForOrders } = await load("../src/lib/portalReorderDetails.ts");
const { savedWorkTotals } = await load("../src/lib/workshopTime.ts");
const { saveAssignments } = await load("../src/lib/assignmentSave.ts");

test("More than 100 pending or reviewed reorder requests retain all items and requested quantities", async () => {
  for (const status of ["pending", "reviewed", "accepted", "declined"]) {
    const requests = Array.from({ length: 1001 }, (_, i) => ({ id: `r-${i}`, status, source_order_id: `o-${i}`, lines: [{ item_id: `i-${i}`, quantity: i + 2 }] }));
    const items = requests.map((request, i) => ({ id: `i-${i}`, order_id: request.source_order_id, name: `Part ${i}` }));
    const batches = [];
    const db = { from(table) {
      let batch, selectedStatus;
      const q = { select() { return q; }, eq(key, value) { selectedStatus = value; return q; }, order() { return q; }, in(key, value) { batch = value; batches.push(value); return q; }, range(from, to) {
        const data = table === "portal_reorder_requests" ? requests.filter(r => r.status === selectedStatus) : items.filter(i => batch.includes(i.order_id));
        return Promise.resolve({ data: data.slice(from, to + 1), error: null });
      } }; return q;
    } };
    const details = await loadReorderDetails(db, status);
    assert.equal(details.requests.length, 1001);
    assert.equal(details.items.length, 1001);
    assert.equal(Math.max(...batches.map(batch => batch.length)), 100);
    assert.equal(resolveReorderLines("o-1000", details.requests[1000].lines, details.items)[0].quantity, 1002);
    assert.equal(resolveReorderLines("o-1000", details.requests[1000].lines, details.items)[0].item.name, "Part 1000");
  }
});
test("Portal and staff readers include more than 1000 items on a single order", async () => {
  const items = Array.from({ length: 1001 }, (_, i) => ({ id: `i-${i}`, order_id: "order-1", name: `Part ${i}` }));
  const db = { from() { const q = { select() { return q; }, in() { return q; }, order() { return q; }, range(from, to) { return Promise.resolve({ data: items.slice(from, to + 1), error: null }); } }; return q; } };
  const result = await readOrderItemsForOrders(db, ["order-1", "order-1"], "id,name");
  assert.equal(result.length, 1001);
  assert.equal(result[1000].name, "Part 1000");
});
test("Collection assignment conflicts never become a bulk success or continue applying a failed plan", async () => {
  const calls = [];
  await assert.rejects(() => saveAssignments(["a", "b", "c"], async id => { calls.push(id); return id !== "b"; }), /assignment was not saved/);
  assert.deepEqual(calls, ["a", "b"]);
  await saveAssignments(["a", "b"], async () => true);
});

test("Staff receives the requested item identity and client-edited quantity, not original quantity", () => {
  const items = [{ id: "item-1", order_id: "order-1", name: "Cutting disc", code: "DISC-01", description: "115 mm", quantity: 2 }];
  const details = resolveReorderLines("order-1", [{ item_id: "item-1", quantity: 7.5 }], items);
  assert.equal(details[0].item.name, "Cutting disc");
  assert.equal(details[0].item.code, "DISC-01");
  assert.equal(details[0].quantity, 7.5);
});
test("Unavailable or wrong-order item identities never resolve to another order's item", () => {
  const details = resolveReorderLines("order-1", [{ item_id: "item-1", quantity: 3 }], [{ id: "item-1", order_id: "order-2", name: "Wrong item" }]);
  assert.equal(details[0].item, null);
  assert.equal(details[0].item_id, "item-1");
  assert.equal(details[0].quantity, 3);
});
test("Multiple reorder lines retain each requested quantity and order", () => {
  const details = resolveReorderLines("order-1", [{ item_id: "b", quantity: 10 }, { item_id: "a", quantity: 4 }], [{ id: "a", order_id: "order-1", name: "Bolt" }, { id: "b", order_id: "order-1", name: "Nut" }]);
  assert.deepEqual(details.map(line => [line.item.name, line.quantity]), [["Nut", 10], ["Bolt", 4]]);
});
test("Repair and sharpening finished sessions retain hours and historical labour snapshots after reload", () => {
  for (const entityType of ["repair", "sharpening"]) {
    const saved = [{ id: "s1", entity_type: entityType, state: "finished", accumulated_seconds: 5400, hourly_rate: 120 }, { id: "s2", entity_type: entityType, state: "finished", accumulated_seconds: 1800, hourly_rate: 200 }];
    assert.deepEqual(savedWorkTotals(JSON.parse(JSON.stringify(saved))), { seconds: 7200, labour: 280, unpricedSeconds: 0 });
  }
});
test("Finished work totals never count active sessions or a finished session twice", () => {
  const finished = { id: "saved", state: "finished", accumulated_seconds: 3600, hourly_rate: 100 };
  assert.deepEqual(savedWorkTotals([finished, finished, { id: "running", state: "running", accumulated_seconds: 7200, hourly_rate: 100 }]), { seconds: 3600, labour: 100, unpricedSeconds: 0 });
});
test("Hours without a rate stay visible but are not claimed as fully priced labour", () => {
  assert.deepEqual(savedWorkTotals([{ id: "s", state: "finished", accumulated_seconds: 1800, hourly_rate: 0 }]), { seconds: 1800, labour: 0, unpricedSeconds: 1800 });
});