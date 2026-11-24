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

const pushSource = await readFile(new URL("../src/lib/pushNotifications.ts", import.meta.url), "utf8");
const parsed = ts.createSourceFile("pushNotifications.ts", pushSource, ts.ScriptTarget.Latest, true);
const declaration = parsed.statements.flatMap(statement => ts.isVariableStatement(statement) ? [...statement.declarationList.declarations] : []).find(declaration => declaration.name.getText(parsed) === "PUSH_TYPES");
if (!declaration?.initializer) throw new Error("Notification types are missing");
const pushTypes = new Function(`return ${declaration.initializer.getText(parsed)}`)();
test("seven-day stock alerts reach the device notification bridge", () => {
  assert.equal(pushTypes.has("stock_low"), true);
});