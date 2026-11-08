const test = require("node:test");
const assert = require("node:assert");
require("../js/stickers.js");
require("../js/catalog.js");
const C = globalThis.Catalog;

const DORILAR = ["Paratsetamol", "Ibuprofen", "Analgin", "Sitramon", "No-shpa", "Aspirin", "Validol", "Korvalol", "Smekta",
  "Aktivlangan ko'mir", "Mezim", "Loratadin", "Suprastin", "Bint", "Yod", "Brilliant yashil", "Gidroperit", "Termometr",
  "Burun tomchisi", "Yo'tal siropi"];

test("Dorilar is the 10th category, right before Boshqalar", () => {
  const ids = C.CATEGORIES.map((c) => c.id);
  assert.deepStrictEqual(ids.slice(-2), ["dori", "boshqa"]);
  assert.strictEqual(ids.length, 10);
  const d = C.category("dori");
  assert.strictEqual(d.name, "Dorilar");
  assert.strictEqual(d.emoji, "💊");
});

test("Dorilar has exactly the 20 common medicines, each with an emoji", () => {
  const d = C.category("dori");
  assert.deepStrictEqual(d.products.map((p) => p.name), DORILAR);
  d.products.forEach((p) => assert.ok(p.emoji && p.emoji.trim(), p.name + " has an emoji"));
  DORILAR.forEach((n) => assert.strictEqual(C.find(n).category, "dori", n));
});

test("isMedicine knows catalogue medicines in any case", () => {
  assert.strictEqual(C.isMedicine("paratsetamol"), true);
  assert.strictEqual(C.isMedicine("YO‘TAL SIROPI"), true);
  assert.strictEqual(C.isMedicine("Non"), false);
  assert.strictEqual(C.isMedicine(""), false);
});
