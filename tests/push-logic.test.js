const test = require("node:test");
const assert = require("node:assert");
require("../js/messages.js");
require("../js/reminders.js");
require("../js/push-logic.js");
const { PushLogic } = globalThis;

const HH = "k".repeat(32);
const WIFE = "11111111-1111-1111-1111-111111111111";
const HUSB = "22222222-2222-2222-2222-222222222222";
const sub = (endpoint, profile_id, household_id = HH) => ({ endpoint, profile_id, household_id, subscription: { endpoint, keys: {} } });

test("pickRecipients returns only the recipient's subscriptions", () => {
  const subs = [sub("a", WIFE), sub("b", HUSB), sub("c", HUSB), sub("d", HUSB, "other".repeat(8))];
  const r = PushLogic.pickRecipients({ household_id: HH, recipient_id: HUSB }, subs);
  assert.deepStrictEqual(r.map((s) => s.endpoint), ["b", "c"]);
});

test("pickRecipients returns [] when the recipient has none", () => {
  assert.deepStrictEqual(PushLogic.pickRecipients({ household_id: HH, recipient_id: WIFE }, [sub("b", HUSB)]), []);
  assert.deepStrictEqual(PushLogic.pickRecipients({ household_id: HH, recipient_id: WIFE }, []), []);
  assert.deepStrictEqual(PushLogic.pickRecipients(null, [sub("b", HUSB)]), []);
});

test("payloadFor maps a notification row to the sw.js payload", () => {
  const p = PushLogic.payloadFor({ type: "grocery_need", title: "T", body: "B", tag: "grocery_need", text: "x", link: "rozgor.html" });
  assert.strictEqual(p.title, "T");
  assert.strictEqual(p.body, "B");
  assert.strictEqual(p.tag, "grocery_need");
  assert.strictEqual(p.url, "rozgor.html");
  assert.ok(Array.isArray(p.vibrate) && p.vibrate.length > 0);
  const old = PushLogic.payloadFor({ module: "tasks", text: "eski", link: null });
  assert.strictEqual(old.body, "eski");
  assert.strictEqual(old.url, "index.html");
  assert.ok(old.title);
});

test("isFresh only accepts recent notifications", () => {
  const now = new Date("2026-10-30T12:00:00Z");
  assert.strictEqual(PushLogic.isFresh({ created_at: "2026-10-30T11:58:00Z" }, now), true);
  assert.strictEqual(PushLogic.isFresh({ created_at: "2026-10-30T10:00:00Z" }, now), false);
});

// Tashkent 17:03 -> kechki (19:00) with lead 2 is due
const NOW = new Date("2026-10-30T17:03:00+05:00");
const base = () => ({
  households: [HH],
  profiles: [
    { id: WIFE, household_id: HH, meal_lead_hours: 2 },
    { id: HUSB, household_id: HH, meal_lead_hours: 0 },
  ],
  settings: [{ household_id: HH, breakfast: "08:00", lunch: "13:00", dinner: "19:00", timezone: "Asia/Tashkent" }],
  meals: [{ household_id: HH, day_date: "2026-10-30", slot: "kechki", title: "Palov" }],
  now: NOW,
});

test("reminderJobs skips lead 0 and puts the planned meal in the body", () => {
  const jobs = PushLogic.reminderJobs(base());
  assert.strictEqual(jobs.length, 1);
  const j = jobs[0];
  assert.deepStrictEqual({ household_id: j.household_id, profile_id: j.profile_id, day: j.day, slot: j.slot },
    { household_id: HH, profile_id: WIFE, day: "2026-10-30", slot: "kechki" });
  const n = j.notification;
  assert.strictEqual(n.household_id, HH);
  assert.strictEqual(n.recipient_id, WIFE);
  assert.strictEqual(n.actor_id, null);
  assert.strictEqual(n.module, "meals");
  assert.strictEqual(n.type, "meal_reminder");
  assert.strictEqual(n.link, "taomlar.html");
  assert.strictEqual(n.read, false);
  assert.strictEqual(n.tag, "meal_reminder-kechki");
  assert.match(n.body, /Palov/);
  assert.strictEqual(n.text, n.body);
  assert.ok(n.title);
});

test("reminderJobs without a planned meal still reminds", () => {
  const jobs = PushLogic.reminderJobs({ ...base(), meals: [] });
  assert.strictEqual(jobs.length, 1);
  assert.match(jobs[0].notification.body, /reja yo'q/);
});

test("reminderJobs ignores another family's meal", () => {
  const jobs = PushLogic.reminderJobs({ ...base(), meals: [{ household_id: "x".repeat(32), day_date: "2026-10-30", slot: "kechki", title: "Manti" }] });
  assert.doesNotMatch(jobs[0].notification.body, /Manti/);
});

test("reminderJobs uses defaults when a family has no settings or a bad timezone", () => {
  assert.strictEqual(PushLogic.reminderJobs({ ...base(), settings: [] }).length, 1);
  assert.strictEqual(PushLogic.reminderJobs({ ...base(), settings: [{ household_id: HH, timezone: "Not/AZone", dinner: "19:00" }] }).length, 1);
});

test("reminderJobs skips profiles of households not listed", () => {
  assert.deepStrictEqual(PushLogic.reminderJobs({ ...base(), households: [] }), []);
});
