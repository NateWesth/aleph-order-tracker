import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { test } from "node:test";
import ts from "typescript";
const source = await readFile(new URL("../src/lib/buyingSheet.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { buyingRequirement, buyingShortfall, isOpenBuyingOrder, buyingOrderQuantity, allocateBuyingQuantity } = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
const { buyingCsvCell, buyingSelectedKeys } = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
test("export preserves quoted product names and multiline notes", () => {
  assert.equal(buyingCsvCell('Blade 12"\nHeavy, duty'), '"Blade 12""\nHeavy, duty"');
});
test("quick actions target only selected rows visible in the queue", () => {
  assert.deepEqual(buyingSelectedKeys([{rowKey:"visible"}], new Set(["hidden", "visible"])), ["visible"]);
});
test("partial receipt is not purchased twice", () => {
  const r = buyingRequirement({ quantity: 10, qty_received: 4, qty_on_po: 7 });
  assert.deepEqual(r, { totalNeeded: 6, allocatedOnPurchaseOrder: 3 });
  assert.equal(buyingShortfall(r.totalNeeded, 1, r.allocatedOnPurchaseOrder), 2);
});
test("fully received lines have no requirement", () => assert.deepEqual(buyingRequirement({ quantity: 10, qty_received: 10, qty_on_po: 10 }), { totalNeeded: 0, allocatedOnPurchaseOrder: 0 }));
test("closed orders never enter procurement", () => {
  assert.equal(isOpenBuyingOrder({ status: "delivered" }), false);
  assert.equal(isOpenBuyingOrder({ status: "ordered", completed_date: "2026-09-30" }), false);
  assert.equal(isOpenBuyingOrder({ status: "ordered", completed_date: null }), true);
});
test("negative stock never inflates purchases", () => assert.equal(buyingShortfall(10, -5, 3), 7));
test("a partial purchase never fully marks every demand line ordered", () => {
  assert.deepEqual(allocateBuyingQuantity([{id:"a",quantity:10,qty_on_po:3},{id:"b",quantity:8,qty_on_po:0}], 9).map(l => [l.id,l.nextQtyOnPO]), [["a",10],["b",2]]);
});
test("custom row identities keep quantity overrides separate", () => {
  assert.equal(buyingOrderQuantity({ rowKey: "M-MISC:one", recommendedOrderQty: 8 }, { "M-MISC:one": 2 }), 2);
  assert.equal(buyingOrderQuantity({ rowKey: "M-MISC:two", recommendedOrderQty: 8 }, { "M-MISC:one": 2 }), 8);
});const { createQuantityPool } = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
test("units already invoiced to the customer are not purchased", () => {
  assert.equal(buyingRequirement({ quantity: 10, qty_received: 0, qty_on_po: 0 }, 6).totalNeeded, 4);
  assert.equal(buyingRequirement({ quantity: 10, qty_received: 0, qty_on_po: 0 }, 12).totalNeeded, 0);
});
test("received and invoiced units are not subtracted twice", () => {
  assert.equal(buyingRequirement({ quantity: 10, qty_received: 5, qty_on_po: 5 }, 5).totalNeeded, 5);
});
test("an open supplier PO covers demand only once across lines", () => {
  const pool = createQuantityPool([["SKU-A", 12]]);
  assert.equal(pool.take("SKU-A", 10), 10);
  assert.equal(pool.take("SKU-A", 10), 2);
  assert.equal(pool.take("SKU-A", 10), 0);
});
