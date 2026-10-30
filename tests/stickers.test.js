const test = require("node:test");
const assert = require("node:assert");
require("../js/stickers.js");
const S = globalThis.Stickers;

test("carrot in three languages", () => {
  assert.strictEqual(S.forName("Sabzi"), "🥕");
  assert.strictEqual(S.forName("морковь"), "🥕");
  assert.strictEqual(S.forName("carrot"), "🥕");
});

test("longest match wins", () => {
  assert.strictEqual(S.forName("Olma"), "🍎");
  assert.strictEqual(S.forName("olma sharbati"), "🧃");
});

test("apostrophe variants are equal", () => {
  assert.strictEqual(S.forName("O‘rik"), "🍑");
  assert.strictEqual(S.forName("o'rik"), "🍑");
});

test("trim and case", () => {
  assert.strictEqual(S.forName("  SUT "), "🥛");
});

test("fallbacks", () => {
  assert.strictEqual(S.forName("Noma'lum narsa", "uy"), "🧴");
  assert.strictEqual(S.forName("xyz"), "🛒");
});

test("list size and unique words", () => {
  assert.ok(S.LIST.length >= 70);
  const seen = new Map();
  for (const { emoji, words } of S.LIST) {
    for (const w of words) {
      assert.ok(!seen.has(w) || seen.get(w) === emoji, `duplicate word: ${w}`);
      seen.set(w, emoji);
      assert.strictEqual(S.forName(w), emoji, `word maps back: ${w}`);
    }
  }
});

test("category fallbacks", () => {
  const want = { sabzavot: "🥬", meva: "🍓", sut: "🧀", gosht: "🍖", non: "🥖", ichimlik: "🧃", uy: "🧴", boshqa: "🛒" };
  for (const [c, e] of Object.entries(want)) assert.strictEqual(S.forName("xyz", c), e, c);
});

test("specific product beats generic word", () => {
  assert.strictEqual(S.forName("Tovuq go'shti"), "🍗");
  assert.strictEqual(S.forName("go'sht"), "🥩");
  assert.strictEqual(S.forName("olma sharbati"), "🧃");
});
