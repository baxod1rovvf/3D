// Runs the generated Edge Function in Node with fake Deno, Supabase and web-push modules.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const SRC = fs.readFileSync(path.join(__dirname, "../supabase/functions/push/index.ts"), "utf8");
const HH = "a".repeat(36);
const WIFE = "11111111-1111-1111-1111-111111111111";
const HUSB = "22222222-2222-2222-2222-222222222222";

// Minimal in-memory stand-in for the supabase-js query builder.
function fakeDb(tables, uniques) {
  const calls = [];
  const from = (table) => {
    const q = { table, op: "select", filters: [], one: null };
    const rows = () => (tables[table] = tables[table] || []);
    const match = (r) => q.filters.every(([op, k, v]) => (op === "eq" ? r[k] === v : op === "gt" ? r[k] > v : op === "gte" ? r[k] >= v : r[k] <= v));
    const run = () => {
      calls.push({ table, op: q.op, filters: q.filters, values: q.values });
      if (q.op === "insert" || q.op === "upsert") {
        const key = uniques[table];
        for (const v of [].concat(q.values)) {
          const dup = key && rows().find((r) => key.every((k) => r[k] === v[k]));
          if (dup && q.op === "upsert") continue;
          if (dup) return { data: null, error: { code: "23505", message: "duplicate" } };
          rows().push({ id: "n" + rows().length, created_at: new Date().toISOString(), ...v });
          if (table === "notifications" && tables.__onNotification) tables.__onNotification(rows()[rows().length - 1]);
        }
        return { data: null, error: null };
      }
      if (q.op === "delete") { tables[table] = rows().filter((r) => !match(r)); return { data: null, error: null }; }
      const found = rows().filter(match);
      if (q.one) return { data: found[0] || null, error: q.one === "single" && !found[0] ? { message: "none" } : null };
      return { data: found, error: null };
    };
    const b = {
      select() { return b; }, eq(k, v) { q.filters.push(["eq", k, v]); return b; },
      gt(k, v) { q.filters.push(["gt", k, v]); return b; }, gte(k, v) { q.filters.push(["gte", k, v]); return b; },
      lte(k, v) { q.filters.push(["lte", k, v]); return b; },
      maybeSingle() { q.one = "maybe"; return b; }, single() { q.one = "single"; return b; },
      insert(v) { q.op = "insert"; q.values = v; return b; }, upsert(v) { q.op = "upsert"; q.values = v; return b; },
      delete() { q.op = "delete"; return b; },
      then(res, rej) { return Promise.resolve().then(run).then(res, rej); },
    };
    return b;
  };
  return { from, calls };
}

function load(tables) {
  const db = fakeDb(tables, { push_keys: ["id"], meal_reminders_sent: ["household_id", "profile_id", "day", "slot"] });
  const sent = [];
  const gone = new Set();
  const webpush = {
    generateVAPIDKeys: () => ({ publicKey: "PUB", privateKey: "PRIV" }),
    async sendNotification(sub, payload, opts) {
      if (gone.has(sub.endpoint)) { const e = new Error("gone"); e.statusCode = 410; throw e; }
      sent.push({ endpoint: sub.endpoint, payload: JSON.parse(payload), opts });
    },
  };
  let handler;
  const env = { SUPABASE_URL: "http://local", SUPABASE_SERVICE_ROLE_KEY: "svc" };
  const code = SRC
    .replace('import webpush from "npm:web-push@3.6.7";', "const webpush = __mocks.webpush;")
    .replace('import { createClient } from "npm:@supabase/supabase-js@2.117.0";', "const createClient = __mocks.createClient;");
  const ctx = {
    __mocks: { webpush, createClient: (url, key) => { assert.strictEqual(key, "svc"); return db; } },
    Deno: { env: { get: (k) => env[k] }, serve: (h) => { handler = h; } },
    Response, URL, JSON, Intl, Date, Promise, Math, Number, String, Array, Object, Set, Error, console,
  };
  ctx.globalThis = ctx;
  vm.runInNewContext(code, ctx);
  const call = (method, url, body) => handler(new Request("http://local/functions/v1/push" + url,
    { method, body: body ? JSON.stringify(body) : undefined, headers: { "Content-Type": "application/json" } }));
  return { call, sent, gone, db };
}

test("OPTIONS and GET public_key answer with CORS; keys are created once", async () => {
  const tables = {};
  const f = load(tables);
  const o = await f.call("OPTIONS", "");
  assert.strictEqual(o.status, 204);
  assert.strictEqual(o.headers.get("Access-Control-Allow-Origin"), "*");
  const r = await f.call("GET", "?public_key");
  assert.strictEqual(r.headers.get("Access-Control-Allow-Origin"), "*");
  assert.deepStrictEqual(await r.json(), { publicKey: "PUB" });
  await f.call("GET", "?public_key");
  assert.strictEqual(tables.push_keys.length, 1);
});

test("POST notification_id pushes to the recipient's phones and drops gone ones", async () => {
  const tables = {
    notifications: [{ id: "n1", household_id: HH, recipient_id: HUSB, module: "grocery", type: "grocery_need", title: "T", body: "B", tag: "grocery_need", text: "B", link: "rozgor.html", created_at: new Date().toISOString() },
      { id: "old", household_id: HH, recipient_id: HUSB, module: "grocery", text: "x", created_at: "2020-01-01T00:00:00Z" }],
    push_subscriptions: [
      { endpoint: "e-husb", household_id: HH, profile_id: HUSB, subscription: { endpoint: "e-husb" } },
      { endpoint: "e-husb-old", household_id: HH, profile_id: HUSB, subscription: { endpoint: "e-husb-old" } },
      { endpoint: "e-wife", household_id: HH, profile_id: WIFE, subscription: { endpoint: "e-wife" } },
    ],
  };
  const f = load(tables);
  f.gone.add("e-husb-old");
  const r = await f.call("POST", "", { notification_id: "n1" });
  assert.deepStrictEqual(await r.json(), { sent: 1 });
  assert.deepStrictEqual(f.sent.map((s) => s.endpoint), ["e-husb"]);
  assert.deepStrictEqual(Object.keys(f.sent[0].payload).sort(), ["body", "tag", "title", "url", "vibrate"]);
  assert.strictEqual(f.sent[0].payload.url, "rozgor.html");
  assert.strictEqual(f.sent[0].opts.TTL, 3600);
  assert.strictEqual(f.sent[0].opts.vapidDetails.publicKey, "PUB");
  assert.deepStrictEqual(tables.push_subscriptions.map((s) => s.endpoint), ["e-husb", "e-wife"]);
  assert.deepStrictEqual(await (await f.call("POST", "", { notification_id: "old" })).json(), { sent: 0 });
  assert.deepStrictEqual(await (await f.call("POST", "", { notification_id: "missing" })).json(), { sent: 0 });
  assert.strictEqual((await f.call("POST", "", { nope: 1 })).status, 400);
});

test("POST tick claims each reminder once and inserts a notification row", async () => {
  const today = new Date().toISOString().slice(0, 10);
  // Pick the dinner time so that "now" is exactly 2 hours before it, in UTC.
  const d = new Date(Date.now() + 2 * 3600000);
  const hhmm = String(d.getUTCHours()).padStart(2, "0") + ":" + String(d.getUTCMinutes()).padStart(2, "0");
  const mealDay = d.toISOString().slice(0, 10);
  const tables = {
    profiles: [{ id: WIFE, household_id: HH, meal_lead_hours: 2 }, { id: HUSB, household_id: HH, meal_lead_hours: 0 }],
    family_settings: [{ household_id: HH, breakfast: "99:99", lunch: "99:99", dinner: hhmm, timezone: "UTC" }],
    meals: [{ household_id: HH, day_date: mealDay, slot: "kechki", title: "Palov" }],
    notifications: [],
  };
  const f = load(tables);
  const r1 = await (await f.call("POST", "", { tick: true })).json();
  const r2 = await (await f.call("POST", "", { tick: true })).json();
  assert.deepStrictEqual([r1, r2], [{ sent: 1 }, { sent: 0 }]);
  assert.strictEqual(tables.meal_reminders_sent.length, 1);
  assert.strictEqual(tables.notifications.length, 1);
  const n = tables.notifications[0];
  assert.strictEqual(n.recipient_id, WIFE);
  assert.strictEqual(n.type, "meal_reminder");
  assert.match(n.body, /Palov/);
  assert.ok(today);
});
