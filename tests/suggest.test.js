const test = require("node:test");
const assert = require("node:assert");
require("../js/stickers.js");
require("../js/suggest.js");
const S = globalThis.Suggest;
const today = "2026-11-08";
const meal = (title, day_date) => ({ title, day_date, ingredients: [] });
const recipe = (title, extra = {}) => ({ id: "r-" + title, title, photo_path: null, ingredients: [], emoji: "🍲", ...extra });

test("never planned first, then the oldest last-made", () => {
  const out = S.meals({ recipes: [recipe("Manti")], meals: [meal("Osh", "2026-10-09"), meal("Lag'mon", "2026-11-06")], today });
  assert.deepStrictEqual(out.map((x) => x.title), ["Manti", "Osh", "Lag'mon"]);
  assert.strictEqual(out[0].lastMade, null);
  assert.strictEqual(out[0].daysAgo, null);
  assert.strictEqual(out[1].lastMade, "2026-10-09");
  assert.strictEqual(out[1].daysAgo, 30);
  assert.strictEqual(out[2].daysAgo, 2);
});

test("anything planned today or tomorrow is left out", () => {
  const out = S.meals({ recipes: [recipe("Shurva")], meals: [meal("Osh", "2026-10-01"), meal("Osh", today), meal("Shurva", "2026-11-09"), meal("Somsa", "2026-10-20")], today });
  assert.deepStrictEqual(out.map((x) => x.title), ["Somsa"]);
});

test("a recipe and a meal that differ only in case/apostrophe are one candidate", () => {
  const out = S.meals({ recipes: [recipe("Mol go‘shti palov")], meals: [meal("mol go'shti palov", "2026-10-29")], today });
  assert.strictEqual(out.length, 1);
  assert.ok(out[0].recipe, "carries the recipe");
  assert.strictEqual(out[0].lastMade, "2026-10-29");
  assert.strictEqual(out[0].daysAgo, 10);
});

test("ties: recipes before plain meals, then by title", () => {
  const out = S.meals({ recipes: [recipe("Somsa"), recipe("Chuchvara")], meals: [meal("Achchiq-chuchuk", "2026-12-20")], today });
  // the December meal is in the future (beyond tomorrow): it counts as never made
  assert.deepStrictEqual(out.map((x) => x.title), ["Chuchvara", "Somsa", "Achchiq-chuchuk"]);
  assert.strictEqual(out[2].recipe, null);
});

test("empty input gives no suggestions", () => {
  assert.deepStrictEqual(S.meals({ recipes: [], meals: [], today }), []);
});
