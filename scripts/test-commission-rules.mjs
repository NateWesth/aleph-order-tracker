import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const src = readFileSync(new URL("../src/lib/commissionRules.ts", import.meta.url), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
const { profitSplitCommission } = mod;
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test("60/40: exactly 25% markup pays 15% of cost for each unit", () => {
  // cost 100, sell 125 -> 25% markup, profit 25 x 2 = 50
  near(profitSplitCommission("profit_split_60", 125, 100, 2).commission, 30);
});

test("60/40: markup below 25% pays rep 50% of profit", () => {
  near(profitSplitCommission("profit_split_60", 120, 100, 1).commission, 10);
});

test("28/72: exactly 25% markup pays 7% of cost for each unit", () => {
  near(profitSplitCommission("profit_split_28", 125, 100, 2).commission, 14);
});

test("60/40: higher markup stays capped at 15% of cost", () => {
  const result = profitSplitCommission("profit_split_60", 200, 100, 3);
  near(result.commission, 45);
  near(result.repShare, 0.15);
});

test("28/72: higher markup stays capped at 7% of cost", () => {
  near(profitSplitCommission("profit_split_28", 200, 100, 3).commission, 21);
});

test("28/72: markup below 25% pays rep 50% of profit", () => {
  near(profitSplitCommission("profit_split_28", 110, 100, 1).commission, 5);
});

test("no commission on losses or unknown cost", () => {
  assert.equal(profitSplitCommission("profit_split_60", 90, 100, 1).commission, 0);
  assert.equal(profitSplitCommission("profit_split_60", 90, null, 1).commission, 0);
});

// Exercise the actual server calculation without invoking Zoho or authentication.
const serverSrc = readFileSync(new URL("../supabase/functions/rep-commission-data/index.ts", import.meta.url), "utf8");
const start = serverSrc.indexOf("const computeEffectiveRate =");
const end = serverSrc.indexOf("\n}", serverSrc.indexOf("const computeLineCommission =")) + 2;
assert.ok(start >= 0 && end > start, "server calculation must be located");
const serverJs = ts.transpileModule(serverSrc.slice(start, end) + "\nexport { computeLineCommission };", { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const { computeLineCommission } = await import("data:text/javascript;base64," + Buffer.from(serverJs).toString("base64"));

test("server and client agree on caps, threshold, low markup and excluded costs", () => {
  for (const method of ["profit_split_60", "profit_split_28"]) {
    for (const [sell, cost, qty] of [[125, 100, 2], [150, 100, 1], [200, 100, 3], [124.99, 100, 2], [110, 100, 1], [90, 100, 1], [90, null, 1], [100, 0, 1]]) {
      const server = computeLineCommission(method, 15, sell * qty, qty, sell, cost);
      near(server.commission, profitSplitCommission(method, sell, cost, qty).commission);
      near(server.effectiveRate, server.commission / (sell * qty) * 100);
    }
  }
});
