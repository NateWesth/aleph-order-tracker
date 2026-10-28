import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const src = readFileSync(new URL("../supabase/functions/rep-commission-data/invoiceLinks.ts", import.meta.url), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { invoiceLinkFingerprint, hasCurrentInvoiceLinks } = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
const links = [{ invoice_id: "8255670000005196535", rep_id: "rep-a" }];
const report = { invoice_links_fingerprint: invoiceLinkFingerprint(links) };

test("linking a COD invoice invalidates an unlinked statement", () => {
  assert.equal(hasCurrentInvoiceLinks({ invoice_links_fingerprint: invoiceLinkFingerprint([]) }, invoiceLinkFingerprint(links)), false);
});
test("changing a COD invoice rep invalidates previous ownership", () => {
  assert.equal(hasCurrentInvoiceLinks(report, invoiceLinkFingerprint([{ ...links[0], rep_id: "rep-b" }])), false);
});
test("unlinking a COD invoice invalidates a linked statement", () => {
  assert.equal(hasCurrentInvoiceLinks(report, invoiceLinkFingerprint([])), false);
});
test("unchanged links can reuse cached statements regardless of row order", () => {
  const rows = [...links, { invoice_id: "second", rep_id: "rep-b" }];
  assert.equal(hasCurrentInvoiceLinks({ invoice_links_fingerprint: invoiceLinkFingerprint(rows) }, invoiceLinkFingerprint([...rows].reverse())), true);
});
test("legacy reports without ownership metadata cannot hide newly saved links", () => {
  assert.equal(hasCurrentInvoiceLinks({}, invoiceLinkFingerprint(links)), false);
});