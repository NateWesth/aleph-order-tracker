import test from "node:test"; import assert from "node:assert/strict";
const { groupByParty, routeStopsFromParties } = await import("../src/lib/routeStops.ts");
const d = (id, kind, name, addr) => ({ doc: { id, kind, contact_name: name, reference: id }, addr });
test("several invoices for one client become one stop", () => {
  const g = groupByParty([d("a","delivery","Acme","1 Main Rd"), d("b","delivery","ACME ","1  main rd"), d("c","collection","Supplier X","5 Side St")]);
  assert.equal(g.length, 2); assert.equal(g[0].docs.length, 2); assert.equal(g[0].deliveries, 2); assert.equal(g[1].collections, 1);
});
test("same name at a different address is a separate stop", () => {
  assert.equal(groupByParty([d("a","delivery","Acme","1 Main"), d("b","delivery","Acme","9 Other")]).length, 2);
});
test("saved run keeps party order and numbers every document", () => {
  const g = groupByParty([d("a","delivery","A","x"), d("b","collection","B","y"), d("c","delivery","A","x")]);
  const s = routeStopsFromParties([g[1], g[0]]);
  assert.deepEqual(s.map(x => [x.sequence, x.entityId]), [[1,"b"],[2,"a"],[3,"c"]]);
});
