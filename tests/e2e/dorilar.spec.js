// E2E (demo mode, headless): medicines with a replacement ("Agar u yo'q bo'lsa"). Run: node tests/e2e/dorilar.spec.js
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
  const needs = () => husb.evaluate(async () => (await Store.list("notifications", { asc: true })).filter((n) => n.type === "grocery_need").map((n) => n.body));
  const row = (name) => wife.evaluate(async (n) => (await Store.list("grocery_items")).find((i) => i.name === n), name);

  await wife.goto(BASE + "/rozgor.html"); await wife.waitForSelector(".g-row");
  await wife.click("#add"); await wife.waitForSelector(".sheet.open #a-own");
  assert.ok(await wife.isHidden("#a-alt-field"), "no alternative field for vegetables");
  await wife.click('.sheet [data-cat="dori"]');
  assert.ok(await wife.isVisible("#a-alt-field"), "alternative field shows for Dorilar");
  assert.match(await wife.textContent("#a-alt-field"), /Agar u yo'q bo'lsa/);
  assert.strictEqual(await wife.locator('.sheet [data-pick]').count(), 20);
  await wife.click('.sheet [data-pick="Paratsetamol"]');
  await wife.focus("#a-own"); await wife.keyboard.press("End"); await wife.keyboard.type(", Non");
  await wife.fill("#a-alt", "Ibuprofen");
  await wife.click(".sheet [data-save]"); await wife.waitForTimeout(600);

  assert.strictEqual((await row("Paratsetamol")).note, "yo'q bo'lsa: Ibuprofen");
  assert.strictEqual((await row("Non")).note || "", "", "the alternative applies only to medicines");
  assert.strictEqual((await row("Paratsetamol")).category, "dori");
  assert.match(await wife.locator(".g-row", { hasText: "Paratsetamol" }).first().textContent(), /yo'q bo'lsa: Ibuprofen/);

  const before = (await needs()).length;
  await wife.goto(BASE + "/index.html"); await wife.waitForFunction(() => window.Store && Store.ctx); await wife.waitForTimeout(400);
  let got = await needs();
  assert.strictEqual(got.length, before + 1);
  assert.match(got[got.length - 1], /Paratsetamol \(yo'q bo'lsa — Ibuprofen\)/, got[got.length - 1]);

  // un-X then X again: one notification, same name (queue/unqueue use the same label)
  await wife.goto(BASE + "/rozgor.html"); await wife.waitForSelector(".g-row");
  const x = () => wife.locator(".g-row", { hasText: "Paratsetamol" }).first().locator("[data-x]").click();
  await x(); await wife.waitForTimeout(250); await x(); await wife.waitForTimeout(250);
  await wife.goto(BASE + "/index.html"); await wife.waitForFunction(() => window.Store && Store.ctx); await wife.waitForTimeout(400);
  got = await needs();
  assert.strictEqual(got.length, before + 2);
  assert.match(got[got.length - 1], /Paratsetamol \(yo'q bo'lsa — Ibuprofen\)/, got[got.length - 1]);

  // typed medicine under Dorilar gets 💊 and category dori
  await wife.goto(BASE + "/rozgor.html"); await wife.waitForSelector(".g-row");
  await wife.click("#add"); await wife.waitForSelector(".sheet.open #a-own");
  await wife.click('.sheet [data-cat="dori"]'); await wife.fill("#a-own", "Nimesil");
  assert.strictEqual((await wife.textContent("#a-sticker")).trim(), "💊");
  await wife.click(".sheet [data-save]"); await wife.waitForTimeout(500);
  assert.strictEqual((await row("Nimesil")).category, "dori");

  // Paratsetamol is already "kerak": adding it again with a new alternative updates the note
  await wife.click("#add"); await wife.waitForSelector(".sheet.open #a-own");
  await wife.click('.sheet [data-cat="dori"]'); await wife.fill("#a-own", "Paratsetamol");
  await wife.fill("#a-alt", "Analgin");
  await wife.click(".sheet [data-save]"); await wife.waitForTimeout(500);
  assert.strictEqual((await row("Paratsetamol")).note, "yo'q bo'lsa: Analgin", "alternative updated on an item already needed");
  await wife.goto(BASE + "/rozgor.html"); await wife.waitForSelector(".g-row");
  const nB = (await needs()).length;
  await wife.goto(BASE + "/index.html"); await wife.waitForFunction(() => window.Store && Store.ctx); await wife.waitForTimeout(400);
  got = await needs();
  assert.match(got[got.length - 1], /Paratsetamol \(yo'q bo'lsa — Analgin\)/, got.slice(-2).join(" | "));
  assert.ok(got.length <= nB + 1, "one notification for the update");
  await wife.goto(BASE + "/rozgor.html"); await wife.waitForSelector(".g-row");

  // shopping mode shows the replacement
  await wife.click('[data-view="need"]'); await wife.click("#shop-open"); await wife.waitForSelector(".shop-item");
  assert.match(await wife.locator(".shop-item", { hasText: "Paratsetamol" }).textContent(), /🔁 Analgin/);
  assert.deepEqual(errors, []);
  console.log("PASS dorilar.spec");
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
