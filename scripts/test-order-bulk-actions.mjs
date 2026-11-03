import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { test } from "node:test";
import ts from "typescript";
const load = async path => ts.transpileModule(await readFile(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const url = js => "data:text/javascript;base64," + Buffer.from(js).toString("base64");
const paging = url(await load("../src/lib/readAllRows.ts"));
const { selectAllOrderIds, orderItemCounters, verifyOrderMutation, updateSelectedOrderStatus, mutateSelectedOrders } = await import(url((await load("../src/lib/orderBulkActions.ts")).replace('"./readAllRows"', JSON.stringify(paging))));
test("Select all includes every matching order across columns, once", () => {
  const orders = Array.from({ length: 1201 }, (_, i) => ({ id: `order-${i}` }));
  const selected = selectAllOrderIds([...orders, orders[0]]);
  assert.equal(selected.size, 1201);
  assert.equal(selected.has("order-1200"), true);
});
test("Complete fills all dependent counters, not just the order status", () => {
  assert.deepEqual(orderItemCounters(11, "delivered"), { qty_on_po: 11, qty_received: 11, qty_invoiced: 11, qty_completed: 11 });
  assert.deepEqual(orderItemCounters(11, "ready"), { qty_on_po: 11, qty_received: 11, qty_invoiced: 11, qty_completed: 0 });
  assert.deepEqual(orderItemCounters(11, "ordered"), { qty_on_po: 0, qty_received: 0, qty_invoiced: 0, qty_completed: 0 });
});
test("Denied or missing bulk mutation rows cannot report success", () => {
  assert.throws(() => verifyOrderMutation(["a", "b"], [{ id: "a" }]), /1 selected order/);
  assert.throws(() => verifyOrderMutation(["a"], []), /1 selected order/);
  verifyOrderMutation(["a", "b"], [{ id: "a" }, { id: "b" }]);
});
test("Bulk delete and assignment include every ID in bounded batches", async () => {
  const ids = Array.from({ length: 1201 }, (_, i) => `order-${i}`);
  const batches = [];
  await mutateSelectedOrders(ids, async batch => { batches.push(batch); return { data: batch.map(id => ({ id })), error: null }; });
  assert.equal(batches.length, 7);
  assert.deepEqual(batches.flat(), ids);
  await assert.rejects(() => mutateSelectedOrders(["a", "b"], async () => ({ data: [{ id: "a" }], error: null })), /1 selected order/);
});
test("Multiple complete updates every item on every selected order, including beyond the row cap", async () => {
  const items = Array.from({ length: 1001 }, (_, i) => ({ id: `item-${i}`, quantity: 3 }));
  const writes = [];
  const db = { from(table) {
    let id, patch, range;
    const q = { select() { return q; }, eq(key, value) { id = value; return q; }, order() { return q; }, range(from, to) { range = [from, to]; return q; }, update(value) { patch = value; return q; }, then(resolve) {
      if (patch) { writes.push({ table, id, patch }); return Promise.resolve(resolve({ data: [{ id }], error: null })); }
      const rows = id === "a" ? items : [{ id: "last-item", quantity: 7 }];
      return Promise.resolve(resolve({ data: rows.slice(range[0], range[1] + 1), error: null }));
    } }; return q;
  } };
  await updateSelectedOrderStatus(db, ["a", "b", "a"], "delivered");
  assert.equal(writes.filter(w => w.table === "order_items").length, 1002);
  assert.deepEqual(writes.filter(w => w.table === "orders").map(w => [w.id, w.patch.status]), [["a", "delivered"], ["b", "delivered"]]);
  assert.equal(writes.find(w => w.id === "last-item").patch.qty_completed, 7);
});