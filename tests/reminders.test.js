const test = require("node:test");
const assert = require("node:assert");
require("../js/reminders.js");
const { Reminders } = globalThis;

const TZ = "Asia/Tashkent"; // UTC+5, no DST
const times = { nonushta: "08:00", tushlik: "13:00", kechki: "19:00" };
// Local Tashkent time -> UTC instant
const at = (day, hh, mm) => new Date(`${day}T${hh}:${mm}:00+05:00`);

test("kechki 19:00 lead 2 at 17:03 is due", () => {
  const r = Reminders.due({ now: at("2026-10-30", "17", "03"), timezone: TZ, times, leadHours: 2 });
  assert.deepStrictEqual(r, [{ slot: "kechki", hours: 2, mealDay: "2026-10-30" }]);
});

test("exactly at reminder time is due", () => {
  const r = Reminders.due({ now: at("2026-10-30", "17", "00"), timezone: TZ, times, leadHours: 2 });
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].slot, "kechki");
});

test("exactly 10 minutes after is not due", () => {
  const r = Reminders.due({ now: at("2026-10-30", "17", "10"), timezone: TZ, times, leadHours: 2 });
  assert.deepStrictEqual(r, []);
});

test("17:11 is outside the window", () => {
  const r = Reminders.due({ now: at("2026-10-30", "17", "11"), timezone: TZ, times, leadHours: 2 });
  assert.deepStrictEqual(r, []);
});

test("before reminder time is not due", () => {
  const r = Reminders.due({ now: at("2026-10-30", "16", "59"), timezone: TZ, times, leadHours: 2 });
  assert.deepStrictEqual(r, []);
});

test("lead 0 is always empty", () => {
  for (const hh of ["07", "11", "17", "18"]) {
    assert.deepStrictEqual(
      Reminders.due({ now: at("2026-10-30", hh, "03"), timezone: TZ, times, leadHours: 0 }), []);
  }
});

test("meal after midnight maps to next day", () => {
  const r = Reminders.due({
    now: at("2026-10-30", "22", "02"), timezone: TZ,
    times: { nonushta: "08:00", tushlik: "13:00", kechki: "01:00" }, leadHours: 3,
  });
  assert.deepStrictEqual(r, [{ slot: "kechki", hours: 3, mealDay: "2026-10-31" }]);
});

test("lead 1 at 07:00 returns only nonushta", () => {
  const r = Reminders.due({ now: at("2026-10-30", "07", "00"), timezone: TZ, times, leadHours: 1 });
  assert.deepStrictEqual(r, [{ slot: "nonushta", hours: 1, mealDay: "2026-10-30" }]);
});

test("uses the given time zone for local date (UTC instant)", () => {
  // 12:03Z = 17:03 Tashkent
  const r = Reminders.due({ now: new Date("2026-10-30T12:03:00Z"), timezone: TZ, times, leadHours: 2 });
  assert.strictEqual(r[0].mealDay, "2026-10-30");
});
