// E2E (demo mode, headless): Taomlar → 📖 Retseptlar and "Bugun nima pishiramiz?". Run: node tests/e2e/recipes.spec.js
const assert = require("node:assert");
const path = require("node:path");
const { chromium } = require("playwright");
const BASE = process.env.BASE || "http://localhost:8765";
const LUCIDE = process.env.LUCIDE_PATH || "/tmp/claude-0/-home-user-3D/600534e3-7512-520f-b92f-9f4302834d42/scratchpad/vendor/package/dist/umd/lucide.min.js";
const PHOTO = path.join(__dirname, "../../assets/icon-192.png");

async function setup(browser, initScript) {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 800 } });
  await ctx.route("**/js/config.js", (r) => r.fulfill({ contentType: "application/javascript", body: "window.OILA_CONFIG={};" }));
  await ctx.route("**/unpkg.com/lucide**", (r) => r.fulfill({ contentType: "application/javascript", path: LUCIDE }));
  await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ contentType: "text/css", body: "" }));
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  if (initScript) await p.addInitScript(initScript);
  await p.goto(BASE + "/kirish.html");
  await p.fill("#w-name", "Malika"); await p.fill("#h-name", "Jasur"); await p.click("button[type=submit]");
  await p.click("#next"); await p.click('.who button[data-id="u-xotin"]'); await p.waitForURL("**/index.html");
  return { p, errors };
}
const today = (p) => p.evaluate(() => App.today());

(async () => {
  const browser = await chromium.launch();

  // ---- Recipes: add with photo + ingredient tiles, open, add to today's menu, edit, delete + undo
  const { p, errors } = await setup(browser);
  await p.goto(BASE + "/taomlar.html"); await p.waitForSelector(".slot");
  assert.ok(await p.isVisible('[data-tab="menu"]') && await p.isVisible('[data-tab="recipes"]'), "two tabs");
  assert.match(await p.textContent('[data-tab="menu"]'), /📅 Menyu/);
  assert.match(await p.textContent('[data-tab="recipes"]'), /📖 Retseptlar/);
  await p.click('[data-tab="recipes"]');
  await p.waitForSelector("#recipe-add");
  await p.click("#recipe-add"); await p.waitForSelector(".sheet.open #r-title");
  await p.setInputFiles("#r-file", PHOTO);
  await p.fill("#r-title", "Mastava");
  await p.click('.sheet [data-rcat="gosht"]'); await p.click('.sheet [data-rpick="Tovuq"]');
  await p.click('.sheet [data-rcat="sabzavot"]'); await p.click('.sheet [data-rpick="Kartoshka"]'); await p.click('.sheet [data-rpick="Sabzi"]');
  assert.strictEqual(await p.inputValue("#r-ings"), "Tovuq, Kartoshka, Sabzi");
  await p.fill("#r-steps", "Tovuqni qaynating.\nSabzavotlarni qo'shing.");
  await p.waitForTimeout(400);
  await p.click(".sheet [data-save]"); await p.waitForTimeout(700);
  const card = p.locator(".recipe-card", { hasText: "Mastava" });
  assert.strictEqual(await card.count(), 1);
  assert.match(await card.textContent(), /3 masalliq/);
  assert.ok(await card.locator("img").count() === 1, "card shows the photo");

  await card.click(); await p.waitForSelector(".sheet.open .recipe-detail");
  const chips = await p.textContent(".sheet .recipe-detail .ings");
  assert.ok(chips.includes("🍗") && chips.includes("🥔") && chips.includes("🥕"), chips);
  assert.match(await p.textContent(".sheet .recipe-detail"), /Sabzavotlarni qo'shing/);
  await p.click(".sheet [data-today]");
  await p.click('.sheet [data-slot="kechki"]'); await p.waitForTimeout(600);
  const t = await today(p);
  const added = await p.evaluate(async (d) => (await Store.list("meals")).filter((m) => m.day_date === d && m.slot === "kechki" && m.title === "Mastava"), t);
  assert.strictEqual(added.length, 1, "added to today's dinner");
  assert.deepStrictEqual(added[0].ingredients, ["Tovuq", "Kartoshka", "Sabzi"]);

  // edit the title
  await p.click('[data-tab="recipes"]');
  await p.locator(".recipe-card", { hasText: "Mastava" }).click(); await p.waitForSelector(".sheet.open .recipe-detail");
  await p.click(".sheet [data-edit-recipe]"); await p.waitForSelector(".sheet.open #r-title");
  await p.fill("#r-title", "Mastava (qo'y go'shtli)"); await p.click(".sheet [data-save]"); await p.waitForTimeout(600);
  assert.strictEqual(await p.locator(".recipe-card", { hasText: "Mastava (qo'y go'shtli)" }).count(), 1);
  // delete, then undo
  await p.locator(".recipe-card", { hasText: "Mastava (qo'y go'shtli)" }).click(); await p.waitForSelector(".sheet.open .recipe-detail");
  await p.click(".sheet [data-del-recipe]"); await p.waitForSelector(".sheet.open [data-ok]"); await p.click(".sheet [data-ok]");
  await p.waitForSelector(".toast-action"); await p.waitForTimeout(300);
  assert.strictEqual(await p.locator(".recipe-card", { hasText: "Mastava (qo'y go'shtli)" }).count(), 0);
  await p.click(".toast-action"); await p.waitForTimeout(600);
  assert.strictEqual(await p.locator(".recipe-card", { hasText: "Mastava (qo'y go'shtli)" }).count(), 1, "undo restores the recipe");
  assert.deepEqual(errors, []);

  // ---- Review focus: the recipes table is missing on the server
  const missing = await setup(browser, () => {
    let s;
    Object.defineProperty(window, "Store", { configurable: true, get: () => s, set(v) {
      const list = v.list.bind(v);
      v.list = (t, o) => (t === "recipes" ? Promise.reject(new Error('relation "public.recipes" does not exist')) : list(t, o));
      s = v;
    } });
  });
  await missing.p.goto(BASE + "/taomlar.html"); await missing.p.waitForSelector(".slot");
  await missing.p.click('[data-tab="recipes"]');
  await missing.p.waitForSelector("text=Retseptlar uchun serverni sozlang");
  await missing.p.click('[data-tab="menu"]');
  assert.ok(await missing.p.isVisible(".slot"), "the menu still works");
  assert.deepEqual(missing.errors, []);

  // ---- Review focus: photo upload fails → recipe saved without a photo, with a toast
  const noPhoto = await setup(browser, () => {
    let s;
    Object.defineProperty(window, "Store", { configurable: true, get: () => s, set(v) { v.uploadPhoto = () => Promise.reject(new Error("upload failed")); s = v; } });
  });
  await noPhoto.p.goto(BASE + "/taomlar.html?tab=recipes"); await noPhoto.p.waitForSelector("#recipe-add");
  await noPhoto.p.click("#recipe-add"); await noPhoto.p.waitForSelector(".sheet.open #r-title");
  await noPhoto.p.setInputFiles("#r-file", PHOTO);
  await noPhoto.p.fill("#r-title", "Manti"); await noPhoto.p.waitForTimeout(300);
  await noPhoto.p.click(".sheet [data-save]");
  await noPhoto.p.waitForSelector("text=rasmsiz saqlandi");
  const saved = await noPhoto.p.evaluate(async () => (await Store.list("recipes")).find((r) => r.title === "Manti"));
  assert.ok(saved && !saved.photo_path, "saved without a photo");
  assert.deepEqual(noPhoto.errors, []);

  // ---- "Bugun nima pishiramiz?": 3 suggestions, next page, add to today, empty state
  const sg = await setup(browser);
  await sg.p.goto(BASE + "/taomlar.html"); await sg.p.waitForSelector(".slot");
  await sg.p.evaluate(async () => {
    for (const title of ["Chuchvara", "Dimlama", "Norin"]) await Store.insert("recipes", { title, ingredients: ["Un"], steps: "", emoji: "🥟", photo_path: null });
  });
  await sg.p.reload(); await sg.p.waitForSelector(".slot");
  await sg.p.click("#suggest-btn"); await sg.p.waitForSelector(".sheet.open .sugg-card");
  let cards = await sg.p.$$eval(".sheet .sugg-card", (els) => els.map((e) => e.textContent.replace(/\s+/g, " ").trim()));
  assert.strictEqual(cards.length, 3, cards.join(" | "));
  assert.match(cards[0], /Chuchvara.*hali pishirilmagan/);
  assert.match(cards[2], /Norin/);
  await sg.p.click(".sheet [data-more]"); await sg.p.waitForTimeout(200);
  cards = await sg.p.$$eval(".sheet .sugg-card", (els) => els.map((e) => e.textContent.replace(/\s+/g, " ").trim()));
  assert.match(cards[0], /Manti.*oxirgi marta 3 kun oldin/, cards.join(" | ")); // demo seed planned Manti 3 days ago
  await sg.p.locator(".sheet .sugg-card", { hasText: "Manti" }).click();
  await sg.p.waitForSelector('.sheet.open [data-slot="tushlik"]'); await sg.p.click('.sheet [data-slot="tushlik"]'); await sg.p.waitForTimeout(600);
  const t2 = await today(sg.p);
  assert.strictEqual(await sg.p.evaluate(async (d) => (await Store.list("meals")).filter((m) => m.day_date === d && m.slot === "tushlik" && m.title === "Manti").length, t2), 1);
  // nothing to suggest → empty state with a "Retsept qo'shish" button
  await sg.p.evaluate(async () => {
    for (const m of await Store.list("meals")) await Store.remove("meals", m.id);
    for (const r of await Store.list("recipes")) await Store.remove("recipes", r.id);
  });
  await sg.p.reload(); await sg.p.waitForSelector(".slot");
  await sg.p.click("#suggest-btn"); await sg.p.waitForSelector(".sheet.open [data-suggest-add]");
  await sg.p.click(".sheet [data-suggest-add]"); await sg.p.waitForSelector(".sheet.open #r-title");
  assert.deepEqual(sg.errors, []);

  console.log("PASS recipes.spec: recipes and suggestions");
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
