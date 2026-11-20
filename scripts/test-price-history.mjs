import assert from "node:assert/strict";
import { summarisePriceChange } from "../src/lib/priceHistory.ts";
const r = summarisePriceChange([{date:"2026-10-01",rate:110,vendor:"A"},{date:"2026-08-01",rate:100,vendor:"A"},{date:"2026-10-01",rate:110,vendor:"A"}]);
assert.equal(r.changePct, 10); assert.equal(r.previous.rate, 100);
assert.equal(summarisePriceChange([{date:"2026-10-01",rate:5,vendor:null}]), null);
console.log("price history ok");
