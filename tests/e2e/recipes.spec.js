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
  await p.goto(BASE + "/taomlar.html"); await p.waitForSelector("#recipe-add");
  assert.match(await p.textContent("#suggest-btn"), /Bugun nima pishiramiz\?/);
  assert.strictEqual(await p.locator(".slot, .weeknav, [data-tab]").count(), 0, "calendar and tabs are gone");
  assert.match(await p.textContent("#recipe-add"), /Taom qo'shish/);
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
  assert.match(await card.textContent(), /3 masalliq · hali pishirilmagan/);
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
  await p.waitForSelector("#today-strip .chip:has-text('Mastava')");
  assert.match(await p.locator(".recipe-card", { hasText: "Mastava" }).textContent(), /bugun/);

  // edit the title
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
  await missing.p.goto(BASE + "/taomlar.html");
  await missing.p.waitForSelector("text=Retseptlar uchun serverni sozlang");
  assert.ok(await missing.p.isVisible("#today-strip .chip"), "today's meals still show");
  await missing.p.click("#suggest-btn"); await missing.p.waitForSelector(".sheet.open .sugg-card");
  assert.deepEqual(missing.errors, []);

  // ---- Review focus: photo upload fails → recipe saved without a photo, with a toast
  const noPhoto = await setup(browser, () => {
    let s;
    Object.defineProperty(window, "Store", { configurable: true, get: () => s, set(v) { v.uploadPhoto = () => Promise.reject(new Error("upload failed")); s = v; } });
  });
  await noPhoto.p.goto(BASE + "/taomlar.html"); await noPhoto.p.waitForSelector("#recipe-add");
  await noPhoto.p.click("#recipe-add"); await noPhoto.p.waitForSelector(".sheet.open #r-title");
  await noPhoto.p.setInputFiles("#r-file", PHOTO);
  await noPhoto.p.fill("#r-title", "Manti"); await noPhoto.p.waitForTimeout(300);
  await noPhoto.p.click(".sheet [data-save]");
  await noPhoto.p.waitForSelector("text=rasmsiz saqlandi");
  const saved = await noPhoto.p.evaluate(async () => (await Store.list("recipes")).find((r) => r.title === "Manti"));
  assert.ok(saved && !saved.photo_path, "saved without a photo");
  assert.deepEqual(noPhoto.errors, []);

  // ---- Built-in examples: 14 dishes listed, read-only until edited into the family's own
  const ex = await setup(browser);
  await ex.p.goto(BASE + "/taomlar.html"); await ex.p.waitForSelector(".recipe-card");
  const titles = await ex.p.$$eval(".recipe-card .tt", (els) => els.map((e) => e.textContent));
  for (const t of ["Osh (Plov)", "Somsa", "Lag‘mon", "Manti", "Sho‘rva", "Chuchvara", "Norin", "Dimlama", "Qozon kabob", "Shashlik", "Mastava", "Moshkichiri", "Moshxo‘rda", "Gumma"]) assert.ok(titles.includes(t), "example " + t + " in " + titles.join(", "));
  await ex.p.locator(".recipe-card", { hasText: "Osh (Plov)" }).click(); await ex.p.waitForSelector(".sheet.open .recipe-detail");
  assert.match(await ex.p.textContent(".sheet .recipe-detail .ings"), /Guruch/);
  assert.strictEqual(await ex.p.locator(".sheet [data-del-recipe]").count(), 0, "examples can't be deleted");
  await ex.p.click(".sheet [data-edit-recipe]"); await ex.p.waitForSelector(".sheet.open #r-title");
  assert.strictEqual(await ex.p.inputValue("#r-title"), "Osh (Plov)");
  await ex.p.fill("#r-steps", "Bizning usul."); await ex.p.click(".sheet [data-save]"); await ex.p.waitForTimeout(600);
  const own = await ex.p.evaluate(async () => (await Store.list("recipes")).filter((r) => r.title === "Osh (Plov)"));
  assert.strictEqual(own.length, 1, "saved as the family's recipe"); assert.strictEqual(own[0].steps, "Bizning usul.");
  assert.strictEqual(await ex.p.locator(".recipe-card", { hasText: "Osh (Plov)" }).count(), 1, "no duplicate card");
  assert.deepEqual(ex.errors, []);

  // ---- "Bugun nima pishiramiz?": 3 suggestions, paging, add to today
  const sg = await setup(browser);
  await sg.p.goto(BASE + "/taomlar.html"); await sg.p.waitForSelector("#recipe-add");
  await sg.p.click("#suggest-btn"); await sg.p.waitForSelector(".sheet.open .sugg-card");
  const page = () => sg.p.$$eval(".sheet .sugg-card", (els) => els.map((e) => e.textContent.replace(/\s+/g, " ").trim()));
  let cards = await page();
  assert.strictEqual(cards.length, 3, cards.join(" | "));
  assert.match(cards[0], /Chuchvara.*hali pishirilmagan/, cards.join(" | "));
  for (let k = 0; k < 8 && !cards.some((c) => /Manti/.test(c)); k++) { await sg.p.click(".sheet [data-more]"); await sg.p.waitForTimeout(150); cards = await page(); }
  assert.match(cards.find((c) => /Manti/.test(c)) || "", /oxirgi marta 3 kun oldin/, cards.join(" | ")); // demo seed planned Manti 3 days ago
  await sg.p.locator(".sheet .sugg-card", { hasText: "Manti" }).click();
  await sg.p.waitForSelector('.sheet.open [data-slot="tushlik"]'); await sg.p.click('.sheet [data-slot="tushlik"]'); await sg.p.waitForTimeout(600);
  const t2 = await today(sg.p);
  const manti = await sg.p.evaluate(async (d) => (await Store.list("meals")).filter((m) => m.day_date === d && m.slot === "tushlik" && m.title === "Manti"), t2);
  assert.strictEqual(manti.length, 1);
  assert.ok(manti[0].ingredients.includes("Un"), "example ingredients carried over");
  assert.deepEqual(sg.errors, []);

  console.log("PASS recipes.spec: recipes and suggestions");
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
