import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { test } from "node:test";
import ts from "typescript";
const source = await readFile(new URL("../src/lib/buyingSheet.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { buyingRequirement, buyingShortfall, isOpenBuyingOrder, buyingOrderQuantity } = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
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
test("custom row identities keep quantity overrides separate", () => {
  assert.equal(buyingOrderQuantity({ rowKey: "M-MISC:one", recommendedOrderQty: 8 }, { "M-MISC:one": 2 }), 2);
  assert.equal(buyingOrderQuantity({ rowKey: "M-MISC:two", recommendedOrderQty: 8 }, { "M-MISC:one": 2 }), 8);
});