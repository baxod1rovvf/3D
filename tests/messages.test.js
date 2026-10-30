const test = require("node:test");
const assert = require("node:assert");
require("../js/messages.js");
const M = globalThis.Messages;

const EMOJI = {
  grocery_need: "🛒", grocery_bought: "🛍️", task_done: "✨", tasks_all_done: "💐",
  task_assigned: "📋", meal_added: "🍽️", memory_added: "📸", meal_reminder: "🍳", test: "🔔",
};
const DATA = {
  actorRole: "xotin", item: "Sut", task: "Idish", tasks: ["A"], meal: "Osh",
  slot: "tushlik", hours: 1, memory: "Sayr",
};

test("tasks_all_done fixed text and ending", () => {
  const data = { actorRole: "xotin", tasks: ["Idishlarni yuvish", "Kirlarni yuvish"] };
  const m = M.build("tasks_all_done", data, () => 0);
  assert.strictEqual(m.fixed, "Xotiningiz bugungi barcha ishlarni tugatdi: Idishlarni yuvish, Kirlarni yuvish");
  assert.ok(m.body.startsWith(m.fixed + " — "));
  assert.ok(m.title.startsWith("💐"));
});

test("different rand gives different body, same fixed", () => {
  const data = { actorRole: "xotin", tasks: ["A"] };
  const a = M.build("tasks_all_done", data, () => 0);
  const b = M.build("tasks_all_done", data, () => 0.99);
  assert.notStrictEqual(a.body, b.body);
  assert.strictEqual(a.fixed, b.fixed);
});

test("husband actor", () => {
  const m = M.build("tasks_all_done", { actorRole: "er", tasks: ["A"] }, () => 0);
  assert.ok(m.fixed.startsWith("Eringiz"));
});

test("meal_reminder", () => {
  const a = M.build("meal_reminder", { slot: "kechki", hours: 2, meal: "Osh" });
  assert.ok(a.body.includes("Kechki ovqatga 2 soat qoldi"));
  assert.ok(a.body.includes("Osh"));
  assert.strictEqual(a.body, a.fixed);
  assert.strictEqual(a.tag, "meal_reminder-kechki");
  const b = M.build("meal_reminder", { slot: "kechki", hours: 2 });
  assert.ok(b.body.includes("nima pishiramiz"));
});

test("titles, vibration and tags for every type", () => {
  for (const [type, emoji] of Object.entries(EMOJI)) {
    const m = M.build(type, DATA, () => 0);
    assert.ok(m.title.startsWith(emoji), type);
    assert.ok(Array.isArray(m.vibrate) && m.vibrate.length === 9, type);
    assert.ok(m.fixed && m.body.startsWith(m.fixed), type);
    if (type !== "meal_reminder") assert.strictEqual(m.tag, type);
  }
  assert.strictEqual(M.build("grocery_need", DATA).vibrate[8], 260);
  assert.strictEqual(M.build("task_done", DATA).vibrate[8], 400);
  assert.strictEqual(M.build("meal_added", DATA).vibrate[8], 600);
  assert.strictEqual(M.build("memory_added", DATA).vibrate[8], 200);
});

test("test type has fixed copy", () => {
  const m = M.build("test", {});
  assert.strictEqual(m.body, "Bildirishnomalar ishlayapti! 🎉");
});

test("endings counts", () => {
  for (const type of Object.keys(EMOJI)) {
    if (type === "meal_reminder" || type === "test") continue;
    for (const role of ["er", "xotin"]) {
      const seen = new Set();
      for (let i = 0; i < 40; i++) {
        const m = M.build(type, { ...DATA, actorRole: role }, () => i / 40);
        seen.add(m.body.slice(m.fixed.length));
      }
      assert.ok(seen.size >= (type === "tasks_all_done" ? 8 : 5), type + " " + role + " " + seen.size);
    }
  }
});
