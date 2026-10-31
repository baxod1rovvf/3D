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

function endingsOf(type, role) {
  const seen = new Set();
  for (let i = 0; i < 100; i++) {
    const m = M.build(type, { ...DATA, actorRole: role }, () => i / 100);
    seen.add(m.body.slice(m.fixed.length + 3));
  }
  return seen;
}

test("endings are specific to each type and role", () => {
  assert.ok(endingsOf("grocery_need", "xotin").has("do'kondan qaytishda olib keling 🥛"));
  assert.ok(endingsOf("grocery_bought", "er").has("rahmat aytishni unutmang 😊"));
  assert.ok(endingsOf("task_done", "xotin").has("zo'r! 👏"));
  assert.ok(endingsOf("tasks_all_done", "xotin").has("unga shokolad olib keling 🍫"));
  assert.ok(endingsOf("tasks_all_done", "er").has("unga mazali choy damlab bering ☕"));
  const need = endingsOf("grocery_need", "xotin");
  const all = endingsOf("tasks_all_done", "xotin");
  assert.ok([...need].every((e) => !all.has(e)));
  assert.ok(!endingsOf("grocery_bought", "er").has("unga mazali choy damlab bering ☕"));
});

test("missing data never yields undefined", () => {
  for (const type of Object.keys(EMOJI)) {
    const m = M.build(type, {}, () => 0);
    assert.ok(!/undefined|NaN|null/.test(m.body), type + ": " + m.body);
  }
});

test("activity text is third person with the actor's first name", () => {
  assert.strictEqual(M.activity("grocery_bought", { actor: "Malika", item: "Non" }), "Malika «Non»ni oldi ✅");
  assert.strictEqual(M.activity("grocery_need", { actor: "Jasur", item: "Sut" }), "Jasur «Sut»ni kerak deb belgiladi");
  assert.strictEqual(M.activity("grocery_added", { actor: "Malika", item: "Guruch" }), "Malika yangi mahsulot qo'shdi: «Guruch»");
  assert.strictEqual(M.activity("task_assigned", { actor: "Jasur", task: "Idish", assignee: "Malika" }), "Jasur yangi ish qo'shdi: «Idish» — Malika uchun");
  assert.strictEqual(M.activity("task_added", { actor: "Jasur", task: "Gilam" }), "Jasur yangi ish qo'shdi: «Gilam»");
  assert.strictEqual(M.activity("meal_added", { actor: "Malika", meal: "Palov", day: "Juma", slot: "kechki" }), "Malika menyuga «Palov» qo'shdi (Juma, kechki ovqat)");
  assert.strictEqual(M.activity("tasks_all_done", { actor: "Malika" }), "Malika bugungi barcha ishlarni tugatdi 💐");
  assert.strictEqual(M.activity("test", { actor: "Malika" }), null);
  assert.strictEqual(M.activity("meal_reminder", {}), null);
  for (const t of ["grocery_need", "grocery_bought", "grocery_added", "task_done", "tasks_all_done", "task_assigned", "task_added", "meal_added", "memory_added"]) {
    const a = M.activity(t, { actor: "Malika" });
    assert.ok(a.startsWith("Malika "), t + ": " + a);
    assert.ok(!/Xotiningiz|Eringiz|Sizga|sizga|undefined/.test(a), t + ": " + a);
  }
  assert.ok(M.activity("task_done", {}).startsWith("Kimdir "));
});

test("meal_reminder uses the dative of each slot", () => {
  assert.ok(M.build("meal_reminder", { slot: "nonushta", hours: 1 }).fixed.startsWith("Nonushtaga 1 soat qoldi"));
  assert.ok(M.build("meal_reminder", { slot: "tushlik", hours: 1 }).fixed.startsWith("Tushlikka 1 soat qoldi"));
  assert.ok(M.build("meal_reminder", { slot: "kechki", hours: 1 }).fixed.startsWith("Kechki ovqatga 1 soat qoldi"));
});

test("tasks_all_done without a list has no trailing colon; meal_added names day and slot", () => {
  assert.strictEqual(M.build("tasks_all_done", { actorRole: "er", tasks: [] }).fixed, "Eringiz bugungi barcha ishlarni tugatdi");
  assert.strictEqual(M.build("meal_added", { actorRole: "xotin", meal: "Palov", day: "Juma", slotName: "Kechki ovqat" }).fixed,
    "Xotiningiz menyuga «Palov» qo'shdi (Juma, kechki ovqat)");
  assert.strictEqual(M.build("task_assigned", { actorRole: "er", task: "Idish" }).fixed, "Eringiz sizga yangi ish berdi: «Idish»");
});

test("reviewed copy: no first-person or wrong-person endings", () => {
  const all = ["grocery_need", "grocery_bought", "task_done", "tasks_all_done", "task_assigned", "meal_added", "memory_added"]
    .flatMap((t) => ["er", "xotin"].flatMap((r) => [...endingsOf(t, r)]));
  for (const bad of ["men olib kelaman", "yordam beraman", "ulgurib qoling", "chaqmoq", "yelkangiz", "chiqsak"]) {
    assert.ok(!all.some((e) => e.includes(bad)), bad);
  }
  assert.ok(endingsOf("grocery_need", "er").has("u bilan birga ro'yxatni ko'rib chiqing 📝"));
  assert.ok(endingsOf("grocery_bought", "er").has("kuchli yelkasi uchun rahmat ayting 💪"));
});

test("grocery batches: count, names, 'yana' and the 6-name limit", () => {
  const r = () => 0;
  const three = Messages.build("grocery_need", { actorRole: "xotin", items: ["Sut", "Non", "Tuxum"] }, r);
  assert.equal(three.fixed, "Xotiningiz 3 ta mahsulotni kerak deb belgiladi: Sut, Non, Tuxum");
  const later = Messages.build("grocery_need", { actorRole: "xotin", items: ["Guruch", "Tuz"], again: true }, r);
  assert.equal(later.fixed, "Xotiningiz yana 2 ta mahsulotni kerak deb belgiladi: Guruch, Tuz");
  assert.equal(Messages.build("grocery_need", { actorRole: "xotin", items: ["Sut"] }, r).fixed, "Xotiningiz «Sut»ni kerak deb belgiladi");
  assert.equal(Messages.build("grocery_need", { actorRole: "er", items: ["Sut"], again: true }, r).fixed, "Eringiz yana «Sut»ni kerak deb belgiladi");
  const many = Messages.build("grocery_bought", { actorRole: "er", items: ["a", "b", "c", "d", "e", "f", "g", "h"] }, r);
  assert.equal(many.fixed, "Eringiz 8 ta mahsulotni oldi ✅: a, b, c, d, e, f va yana 2 ta");
  assert.equal(Messages.activity("grocery_need", { actor: "Malika", items: ["Sut", "Non"], again: true }), "Malika yana 2 ta mahsulotni kerak deb belgiladi: Sut, Non");
});
