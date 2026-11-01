// E2E (demo mode, headless): undo, shopping mode, quiet hours, dark mode. Run: node tests/e2e/convenience.spec.js
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
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(BASE + "/kirish.html");
  await p.fill("#w-name", "Malika"); await p.fill("#h-name", "Jasur"); await p.click("button[type=submit]");
  await p.click("#next"); await p.click('.who button[data-id="u-xotin"]'); await p.waitForURL("**/index.html");
  const status = (name) => p.evaluate(async (n) => (await Store.list("grocery_items")).find((i) => i.name === n).status, name);

  // ---- Undo: X on Kartoshka, then "Bekor qilish" puts it back.
  await p.goto(BASE + "/rozgor.html"); await p.waitForSelector(".g-row");
  await p.locator(".g-row", { hasText: "Kartoshka" }).locator("[data-x]").click();
  await p.waitForSelector(".toast-action");
  assert.strictEqual(await status("Kartoshka"), "kerak");
  await p.click(".toast-action"); await p.waitForTimeout(500);
  assert.strictEqual(await status("Kartoshka"), "bor", "undo restores the X");
  // Undo of ✓ bought.
  await p.click('[data-view="need"]');
  await p.locator(".g-row", { hasText: "Pomidor" }).locator("[data-buy]").click();
  await p.waitForSelector(".toast-action"); await p.waitForTimeout(200);
  assert.strictEqual(await status("Pomidor"), "olindi");
  await p.locator(".toast-action").last().click(); await p.waitForTimeout(500);
  assert.strictEqual(await status("Pomidor"), "kerak", "undo restores the purchase");

  // ---- Shopping mode: big list, progress, ticking marks bought; ticking again undoes.
  await p.click("#shop-open"); await p.waitForSelector(".shop .shop-item");
  const total = await p.locator(".shop-item").count();
  assert.ok(total >= 4, "all needed items listed: " + total);
  assert.match(await p.textContent(".shop-progress"), new RegExp(`^0 / ${total} olindi`));
  await p.locator(".shop-item", { hasText: "Sut" }).click(); await p.waitForTimeout(400);
  assert.match(await p.textContent(".shop-progress"), new RegExp(`^1 / ${total} olindi`));
  assert.strictEqual(await status("Sut"), "olindi");
  await p.locator(".shop-item", { hasText: "Sut" }).click(); await p.waitForTimeout(400);
  assert.strictEqual(await status("Sut"), "kerak", "untick puts it back to Kerak");
  for (let k = 0; k < total; k++) { await p.locator(".shop-item:not(.got)").first().click(); await p.waitForTimeout(250); }
  assert.ok(await p.isVisible("text=Hammasi olindi!"), "celebration when everything is bought");
  await p.click(".shop-done [data-close-shop]");
  assert.strictEqual(await p.locator(".shop").count(), 0);

  // ---- Quiet hours: saved for this phone and mirrored where the service worker reads it.
  await p.click("#settings-btn"); await p.waitForSelector("[data-quiet-on]");
  await p.check("[data-quiet-on]");
  await p.fill("[data-quiet-from]", "22:30"); await p.locator("[data-quiet-from]").dispatchEvent("change");
  await p.waitForTimeout(300);
  const mirrored = await p.evaluate(async () => { const r = await (await caches.open("oila-prefs")).match("prefs/quiet"); return r && r.json(); });
  assert.deepStrictEqual(mirrored, { on: true, from: "22:30", to: "07:00" });

  // ---- Dark mode: choose "Qorong'i", page turns dark and stays dark after reload.
  await p.locator('[data-theme-choice] label', { hasText: "Qorong'i" }).click();
  await p.waitForTimeout(200);
  const bg = () => p.evaluate(() => getComputedStyle(document.querySelector(".app")).backgroundColor);
  assert.strictEqual(await bg(), "rgb(23, 19, 31)");
  await p.reload(); await p.waitForSelector(".g-row");
  assert.strictEqual(await p.evaluate(() => document.documentElement.dataset.theme), "dark");
  assert.strictEqual(await bg(), "rgb(23, 19, 31)");
  await p.click("#settings-btn"); await p.waitForSelector("[data-theme-choice]");
  await p.locator('[data-theme-choice] label', { hasText: "Yorug'" }).click(); await p.waitForTimeout(200);
  assert.strictEqual(await bg(), "rgb(255, 248, 236)");

  assert.deepEqual(errors, []);
  console.log("PASS convenience.spec: undo, shopping mode, quiet hours, dark mode");
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
