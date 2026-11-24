import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

function moduleAt(path, imports) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {};
  vm.runInNewContext(js, { exports, require: name => imports[name], crypto: { randomUUID: () => "new-session" }, console, Date, window: imports.window, document: imports.document, navigator: imports.navigator });
  return exports;
}
const { readAllRows } = moduleAt("../src/lib/readAllRows.ts", {});
const { savedWorkTotals } = moduleAt("../src/lib/workshopTime.ts", {});
const { readEntityCommentData } = moduleAt("../src/lib/entityCommentData.ts", { "./readAllRows": { readAllRows } });
const { readWorkshopReportData, requireWorkshopReportData } = moduleAt("../supabase/functions/_shared/workshop-report-data.ts", {});
const settle = async () => { for (let n = 0; n < 20; n++) await Promise.resolve(); };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

function componentHarness(path, db) {
  const values = [], effects = [], callbacks = [], feeds = [];
  const React = {
    useState(initial) { const index = values.length; values.push(typeof initial === "function" ? initial() : initial); return [values[index], next => { values[index] = typeof next === "function" ? next(values[index]) : next; }]; },
    useRef: current => ({ current }),
    useEffect: callback => effects.push(callback),
    useCallback: callback => { callbacks.push(callback); return callback; },
    useMemo: callback => callback(),
  };
  const fallback = new Proxy({}, { get: (_, key) => ["SERVICE_STATUSES", "PRIORITIES", "GROUP_SPINES"].includes(key) ? [] : () => null });
  const imports = new Proxy({
    react: React,
    "react/jsx-runtime": { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    "@/integrations/supabase/client": { supabase: db },
    "@/contexts/AuthContext": { useAuth: () => ({ user: { id: "tech-a" } }) },
    "@/hooks/use-toast": { useToast: () => ({ toast() {} }) },
    "@/hooks/useConflictSave": { useConflictSave: () => ({ dialog: null }) },
    "@/hooks/useDraftRecovery": { useDraftRecovery: () => ({ banner: null }) },
    "@/hooks/useViewportMenuPosition": { useViewportMenuPosition: () => ({}) },
    "@/hooks/useLiveData": { useLiveData: (tables, refresh) => feeds.push({ tables: [...tables], refresh }) },
    "@/lib/readAllRows": { readAllRows },
    "@/lib/workshopTime": { savedWorkTotals },
    "@/lib/entityCommentData": { readEntityCommentData },
    "@/lib/fabricationPdf": { FABRICATION_STAGES: [], PROJECT_TYPES: [], stageLabel: value => value },
  }, { get: (target, name) => target[name] ?? fallback });
  const module = moduleAt(path, imports);
  const Component = module.default ?? module.useNotifications;
  Component({ entityType: "sharpening", entityId: "job-1", label: "Sharpening", references: [], defaultOpen: true });
  return { values, effects, load: callbacks[0], feed: feeds[0] };
}

function tableDb(getRows) {
  return { from(table) {
    const filters = [], orders = [];
    const q = {
      select() { return q; }, eq(key, value) { filters.push([key, value]); return q; },
      in(key, value) { filters.push([key, value]); return q; }, order(key) { orders.push(key); return q; }, limit() { return q; },
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      range: (from, to) => getRows(table, from, to, filters, orders),
    };
    return q;
  } };
}

test("Sharpening reads every saved job without per-user filtering or the 1000-row cap", async () => {
  const rows = Array.from({ length: 1001 }, (_, i) => ({ id: `job-${i}`, assigned_to: i % 2 ? "tech-a" : "tech-b", status: "not_started" }));
  const db = tableDb((table, from, to, filters, orders) => {
    assert.equal(filters.length, 0);
    assert.ok(orders.includes("id"));
    return Promise.resolve({ data: table === "profiles" ? [] : rows.slice(from, to + 1), error: null });
  });
  const h = componentHarness("../src/components/admin/SharpeningPage.tsx", db);
  await h.load();
  assert.equal(h.values[0].length, 1001);
  assert.equal(h.values[0][1000].assigned_to, "tech-b");
  assert.deepEqual(h.feed.tables, ["sharpening_jobs", "profiles"]);
});

test("An older sharpening read cannot overwrite a more recent user's edit", async () => {
  const first = deferred(); let calls = 0;
  const h = componentHarness("../src/components/admin/SharpeningPage.tsx", tableDb(table => {
    if (table === "profiles") return Promise.resolve({ data: [], error: null });
    return ++calls === 1 ? first.promise : Promise.resolve({ data: [{ id: "job-1", status: "completed" }], error: null });
  }));
  const oldRead = h.load();
  await h.feed.refresh();
  first.resolve({ data: [{ id: "job-1", status: "not_started" }], error: null });
  await oldRead;
  assert.equal(h.values[0][0].status, "completed");
});

test("A failed later page keeps the last complete sharpening snapshot", async () => {
  let fail = false;
  const h = componentHarness("../src/components/admin/SharpeningPage.tsx", tableDb((table, from) => {
    const data = table === "profiles" ? [] : fail ? Array.from({ length: 500 }, (_, i) => ({ id: `partial-${i}` })) : [{ id: "saved-job" }];
    return Promise.resolve(from ? { data: null, error: { message: "Offline" } } : { data, error: null });
  }));
  await h.load(); fail = true; await h.feed.refresh();
  assert.equal(h.values[0].length, 1);
  assert.equal(h.values[0][0].id, "saved-job");
});

test("Another technician's finished sharpening hours refresh without reopening the job", async () => {
  let saved = [];
  const h = componentHarness("../src/components/admin/workshop/WorkshopTimer.tsx", tableDb((table, from, to, filters) => {
    if (table === "profiles") return Promise.resolve({ data: [], error: null });
    assert.ok(filters.some(([key, value]) => key === "entity_id" && value === "job-1"));
    assert.ok(!filters.some(([key]) => key === "technician_id"));
    return Promise.resolve({ data: saved.slice(from, to + 1), error: null });
  }));
  await h.load();
  saved = [{ id: "finished-b", technician_id: "tech-b", state: "finished", accumulated_seconds: 5400, hourly_rate: 120 }];
  await h.feed.refresh();
  assert.deepEqual(h.feed.tables, ["workshop_timer_sessions", "profiles"]);
  assert.equal(h.values[6][0].technician_id, "tech-b");
  assert.equal(savedWorkTotals(h.values[6]).seconds, 5400);
  assert.equal(savedWorkTotals(h.values[6]).labour, 180);
});

function liveHarness(refresh) {
  let next = 0;
  const timeouts = new Map(), intervals = new Map(), events = new Map(), handlers = [], removed = [];
  let status;
  const window = {
    setTimeout(fn) { const id = ++next; timeouts.set(id, fn); return id; }, clearTimeout: id => timeouts.delete(id),
    setInterval(fn) { const id = ++next; intervals.set(id, fn); return id; }, clearInterval: id => intervals.delete(id),
    addEventListener: (key, fn) => events.set(key, fn), removeEventListener: key => events.delete(key),
  };
  const document = { visibilityState: "visible", addEventListener: (key, fn) => events.set(key, fn), removeEventListener: key => events.delete(key) };
  const navigator = { onLine: true }, effects = [];
  const channel = { on(_, filter, fn) { handlers.push({ filter, fn }); return channel; }, subscribe(fn) { status = fn; return channel; } };
  const { useLiveData } = moduleAt("../src/hooks/useLiveData.ts", {
    react: { useRef: current => ({ current }), useEffect: fn => effects.push(fn) },
    "@/integrations/supabase/client": { supabase: { channel: () => channel, removeChannel: c => removed.push(c) } },
    window, document, navigator,
  });
  useLiveData(["sharpening_jobs"], refresh);
  const cleanups = effects.map(fn => fn());
  return {
    handlers, events, intervals, removed, document, navigator,
    status: value => status(value),
    flush: async () => { const callbacks = [...timeouts.values()]; timeouts.clear(); for (const fn of callbacks) fn(); await settle(); },
    dispose: () => cleanups.forEach(fn => fn?.()),
  };
}

test("Sharpening catches up after subscription, edits, focus, reconnection and missed events", async () => {
  let savedStatus = "not_started", visibleStatus, reads = 0;
  const h = liveHarness(async () => { reads++; visibleStatus = savedStatus; });
  h.status("SUBSCRIBED"); await h.flush(); assert.equal(visibleStatus, "not_started");
  savedStatus = "in_progress"; h.handlers[0].fn(); await h.flush(); assert.equal(visibleStatus, "in_progress");
  for (const event of ["focus", "visibilitychange", "online"]) {
    savedStatus = event; h.events.get(event)(); await h.flush(); assert.equal(visibleStatus, event);
  }
  savedStatus = "reconnected"; h.status("CHANNEL_ERROR"); await h.flush(); await h.flush(); assert.equal(visibleStatus, "reconnected");
  savedStatus = "completed"; for (const fn of h.intervals.values()) fn(); await settle(); assert.equal(visibleStatus, "completed");
  const before = reads; h.document.visibilityState = "hidden"; for (const fn of h.intervals.values()) fn(); await settle(); assert.equal(reads, before);
  h.dispose(); assert.equal(h.removed.length, 1); assert.equal(h.events.size, 0); assert.equal(h.intervals.size, 0);
  h.handlers[0].fn(); await h.flush(); assert.equal(reads, before);
});

test("An edit received during a live read is fetched again after that read completes", async () => {
  const pending = deferred(); let reads = 0;
  const h = liveHarness(async () => { if (++reads === 1) await pending.promise; });
  h.handlers[0].fn(); await h.flush();
  h.handlers[0].fn(); await h.flush(); assert.equal(reads, 1);
  pending.resolve(); await settle(); await h.flush(); assert.equal(reads, 2);
  h.dispose();
});

test("Repairs uses the same complete, recoverable cross-user snapshot as sharpening", async () => {
  const rows = Array.from({ length: 1001 }, (_, i) => ({ id: `repair-${i}`, ticket_number: `R-${i}`, status: "not_started", tool_code: "TOOL", date_received_by_client: "2026-11-24" }));
  const h = componentHarness("../src/components/admin/RepairsPage.tsx", tableDb((table, from, to) => Promise.resolve({ data: table === "profiles" ? [] : rows.slice(from, to + 1), error: null })));
  await h.load(); assert.equal(h.values[0].length, 1001);
  assert.deepEqual(h.feed.tables, ["repair_tickets", "profiles"]);
});

test("Sharpening comment threads retain all comments and reactions with bounded reads", async () => {
  const comments = Array.from({ length: 1001 }, (_, i) => ({ id: `c-${i}`, entity_type: "sharpening", entity_id: "job-1", user_id: "tech-b", body: `Note ${i}`, created_at: "2026-11-24", reply_to_id: null }));
  const reactions = comments.flatMap(comment => Array.from({ length: 11 }, (_, i) => ({ id: `${comment.id}-r-${i}`, comment_id: comment.id, user_id: `tech-${i}`, emoji: "👍" })));
  const batches = [];
  const db = tableDb((table, from, to, filters) => {
    let data;
    if (table === "entity_comments") {
      assert.ok(filters.some(([key, value]) => key === "entity_type" && value === "sharpening"));
      assert.ok(filters.some(([key, value]) => key === "entity_id" && value === "job-1"));
      data = comments;
    } else if (table === "profiles") data = [{ id: "tech-b", full_name: "Technician B", email: null }];
    else { const batch = filters.find(([key]) => key === "comment_id")[1]; batches.push(batch); data = reactions.filter(reaction => batch.includes(reaction.comment_id)); }
    return Promise.resolve({ data: data.slice(from, to + 1), error: null });
  });
  const result = await readEntityCommentData(db, "sharpening", "job-1");
  assert.equal(result.comments.length, 1001); assert.equal(result.reactions.length, 11011);
  assert.equal(Math.max(...batches.map(batch => batch.length)), 100);
  assert.equal(result.members[0].full_name, "Technician B");
  const overview = await readEntityCommentData(tableDb((table, from, to) => Promise.resolve({ data: table === "entity_comments" ? comments.slice(from, to + 1) : [], error: null })), "sharpening", undefined, 60);
  assert.equal(overview.comments.length, 60);
});

test("Morning and afternoon workshop snapshots include all active jobs but never mask read errors", async () => {
  for (const table of ["sharpening_jobs", "repair_tickets"]) {
    const rows = Array.from({ length: 1001 }, (_, i) => ({ id: `job-${i}`, status: "not_started" }));
    let fail = false;
    const db = { from(name) { assert.equal(name, table); const q = { select() { return q; }, neq(key, value) { assert.equal(value, "completed"); return q; }, not(key, op, value) { assert.equal(value, "(completed,scrapped)"); return q; }, order() { return q; }, range(from, to) { return Promise.resolve(fail && from ? { data: null, error: { message: "Offline" } } : { data: rows.slice(from, to + 1), error: null }); } }; return q; } };
    assert.equal((await readWorkshopReportData(db, table, "id,status")).data.length, 1001);
    fail = true;
    const results = await Promise.allSettled([readWorkshopReportData(db, table, "id,status")]);
    assert.throws(() => requireWorkshopReportData(results), /could not refresh: Offline/);
  }
});

test("Fabrication list retains every shared project and the last saved snapshot after failures", async () => {
  let fail = false;
  const rows = Array.from({ length: 1001 }, (_, i) => ({ id: `fab-${i}`, name: `Project ${i}`, stage: "stripping", start_date: "2026-11-24" }));
  const h = componentHarness("../src/components/admin/FabricationPage.tsx", tableDb((table, from, to) => Promise.resolve({ data: fail ? null : table === "profiles" ? [] : rows.slice(from, to + 1), error: fail ? { message: "Disconnected" } : null })));
  await h.load(); assert.equal(h.values[0].length, 1001);
  assert.deepEqual(h.feed.tables, ["fabrication_projects", "profiles"]);
  fail = true; await h.feed.refresh(); assert.equal(h.values[0].length, 1001);
});

test("Notification recovery reads only the current user's alerts and refreshes remote dismissal/read changes", async () => {
  let rows = [{ id: "alert-1", user_id: "tech-a", read: false }];
  const db = { rpc: async () => ({ data: 0, error: null }), from(table) {
    assert.equal(table, "notifications");
    const filters = []; let head = false;
    const q = { select(fields, options) { head = !!options?.head; return q; }, eq(key, value) { filters.push([key, value]); return q; }, order() { return q; }, limit() { return q; }, then(resolve) {
      assert.ok(filters.some(([key, value]) => key === "user_id" && value === "tech-a"));
      return Promise.resolve({ data: head ? null : rows, count: rows.filter(row => !row.read).length, error: null }).then(resolve);
    } }; return q;
  } };
  const h = componentHarness("../src/hooks/useNotifications.ts", db);
  await h.load(); assert.equal(h.values[1], 1);
  rows = [{ ...rows[0], read: true }]; await h.feed.refresh(); assert.equal(h.values[1], 0); assert.equal(h.values[0][0].read, true);
  rows = []; await h.feed.refresh(); assert.equal(h.values[0].length, 0);
});