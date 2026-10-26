import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { test } from "node:test";
import ts from "typescript";
const source = await readFile(new URL("../src/lib/notificationPreference.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { deviceNotificationsAllowed } = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
test("turning device notifications off blocks alerts even with OS permission", () => {
  assert.equal(deviceNotificationsAllowed("off"), false);
  assert.equal(deviceNotificationsAllowed("on"), true);
  assert.equal(deviceNotificationsAllowed(null), true);
});