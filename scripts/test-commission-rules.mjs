import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const src = readFileSync(new URL("../src/lib/commissionRules.ts", import.meta.url), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
const { profitSplitCommission } = mod;
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test("60/40: markup 25% or more pays rep 60% of profit", () => {
  // cost 100, sell 125 -> 25% markup, profit 25 x 2 = 50
  near(profitSplitCommission("profit_split_60", 125, 100, 2).commission, 30);
});

test("60/40: markup below 25% pays rep 50% of profit", () => {
  near(profitSplitCommission("profit_split_60", 120, 100, 1).commission, 10);
});

test("28/72: markup 25% or more pays rep 28% of profit", () => {
  near(profitSplitCommission("profit_split_28", 150, 100, 1).commission, 14);
});

test("28/72: markup below 25% pays rep 50% of profit", () => {
  near(profitSplitCommission("profit_split_28", 110, 100, 1).commission, 5);
});

test("no commission on losses or unknown cost", () => {
  assert.equal(profitSplitCommission("profit_split_60", 90, 100, 1).commission, 0);
  assert.equal(profitSplitCommission("profit_split_60", 90, null, 1).commission, 0);
});
