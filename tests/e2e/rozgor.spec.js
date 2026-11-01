// E2E (demo mode, headless): Ro'zg'or gift wishes and multi-select adding. Run: node tests/e2e/rozgor.spec.js
const assert = require("node:assert");
const { chromium } = require("playwright");
const BASE = process.env.BASE || "http://localhost:8765";
const LUCIDE = process.env.LUCIDE_PATH || "/tmp/claude-0/-home-user-3D/600534e3-7512-520f-b92f-9f4302834d42/scratchpad/vendor/package/dist/umd/lucide.min.js";

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 375, height: 800 } });
  const errors = [];
  await ctx.route("**/js/config.js", (r) => r.fulfill({ contentType: "application/javascript", body: "window.OILA_CONFIG={};" }));
  await ctx.route("**/unpkg.com/lucide**", (r) => r.fulfill({ contentType: "application/javascript", path: LUCIDE }));
  await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ contentType: "text/css", body: "" }));
  const wife = await ctx.newPage();
  wife.on("pageerror", (e) => errors.push(e.message));
  await wife.goto(BASE + "/kirish.html");
  await wife.fill("#w-name", "Malika"); await wife.fill("#h-name", "Jasur"); await wife.click("button[type=submit]");
  await wife.click("#next"); await wife.click('.who button[data-id="u-xotin"]'); await wife.waitForURL("**/index.html");
  const husb = await ctx.newPage();
  await husb.addInitScript(() => { sessionStorage.setItem("oila-family-key", "demo-family"); sessionStorage.setItem("oila-me", "u-er"); });
  await husb.goto(BASE + "/index.html"); await husb.waitForFunction(() => window.Store && Store.ctx);
  const notes = () => husb.evaluate(async () => (await Store.list("notifications")).map((n) => n.type + "|" + n.body));

  // 🎁 Xohish: "Хочу" on Banan and Cola.
  await wife.goto(BASE + "/rozgor.html?view=gift");
  await wife.waitForSelector(".gift");
  assert.ok(await wife.locator(".gift").count() >= 20, "at least 20 treats");
  assert.ok(await wife.isHidden(".search"), "no search box on the gift tab");
  await wife.locator(".gift", { hasText: "Banan" }).locator("button").click();
  await wife.locator(".gift", { hasText: "Cola" }).locator("button").click();
  await wife.waitForTimeout(500);
  const got = await notes();
  assert.ok(got.includes("gift_wish|Dadajonisi, rosa banan yegim kelyapdi. Qaytishizda olib keliiing 🥺"), got.join("\n"));
  assert.ok(got.includes("gift_wish|Dadajonisi, rosa cola ichgim kelyapdi. Qaytishizda olib keliiing 🥺"), got.join("\n"));

  // Add sheet: no Shoshilinch / Hozir kerak; pick 3 hygiene products + one typed product.
  await wife.click('[data-view="all"]');
  await wife.click("#add"); await wife.waitForSelector(".sheet.open #a-own");
  const sheetText = await wife.textContent(".sheet");
  assert.ok(!/Shoshilinch|Hozir kerak/.test(sheetText), "no urgent / needed toggles when adding");
  assert.strictEqual(await wife.locator(".sheet [data-cat]").count(), 9, "nine categories");
  await wife.click('.sheet [data-cat="gigiyena"]');
  assert.ok(await wife.evaluate(() => { const r = document.querySelector("#a-cats"); return r.scrollHeight < 70 && r.scrollWidth > r.clientWidth; }), "categories sit on one scrolling line");
  for (const n of ["Sovun", "Tish pastasi", "Bolalar tagligi (pampers)"]) await wife.click(`.sheet [data-pick="${n}"]`);
  assert.strictEqual(await wife.inputValue("#a-own"), "Sovun, Tish pastasi, Bolalar tagligi (pampers)", "picked products are written into the name box");
  assert.strictEqual((await wife.textContent("#a-sticker")).trim(), "👶", "emoji on the left follows the last product");
  await wife.click('.sheet [data-pick="Tish pastasi"]'); // tap again: removed from the box
  assert.strictEqual(await wife.inputValue("#a-own"), "Sovun, Bolalar tagligi (pampers)");
  await wife.click('.sheet [data-pick="Tish pastasi"]');
  await wife.focus("#a-own"); await wife.keyboard.press("End"); await wife.keyboard.type(", Bolalar sochiqchasi");
  assert.match(await wife.textContent(".sheet [data-save]"), /\(4\)/);
  await wife.click(".sheet [data-save]");
  await wife.waitForTimeout(600);
  const rows = await wife.evaluate(async () => (await Store.list("grocery_items")).filter((i) => i.status === "kerak").map((i) => i.name + "|" + i.category));
  for (const n of ["Sovun|gigiyena", "Tish pastasi|gigiyena", "Bolalar tagligi (pampers)|gigiyena", "Bolalar sochiqchasi|gigiyena"]) assert.ok(rows.includes(n), n + " in " + rows);
  const pampers = await wife.locator(".g-row", { hasText: "pampers" }).first().locator(".sticker").textContent();
  assert.strictEqual(pampers.trim(), "👶");
  assert.ok(await wife.isVisible("text=Gigiyena vositalari"), "new category heading");
  assert.deepEqual(errors, []);
  console.log("PASS rozgor.spec: gift wishes, nine categories, multi-select add");
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
