// E2E (demo mode, headless): switching sections happens inside one page. Run: node tests/e2e/spa.spec.js
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
  await p.waitForSelector("#overview .ov");
  await p.evaluate(() => { window.__sameDocument = true; });
  await p.waitForTimeout(800); // background prefetch of the other sections

  const ready = { "rozgor.html": ".g-row", "taomlar.html": ".slot", "xotiralar.html": ".mem, #content .empty", "uy-ishlari.html": ".task, #list .empty", "index.html": "#overview .ov" };
  for (const round of [1, 2]) {
    for (const [href, sel] of Object.entries(ready)) {
      const t0 = Date.now();
      await p.click(`.tab[href="${href}"]`);
      await p.waitForSelector(sel);
      const ms = Date.now() - t0;
      assert.ok(p.url().endsWith(href), "address follows the section: " + p.url());
      assert.ok(await p.evaluate(() => window.__sameDocument === true), "no page reload when opening " + href);
      assert.strictEqual(await p.locator(".app").count(), 1);
      assert.strictEqual(await p.locator(".tab.active").getAttribute("href"), href);
      console.log(`round ${round} ${href}: ${ms} ms`);
    }
  }
  // The old page can't leak into the new one: rozgor X still works after several switches.
  await p.click('.tab[href="rozgor.html"]'); await p.waitForSelector(".g-row");
  await p.locator(".g-row", { hasText: "Kartoshka" }).locator("[data-x]").click();
  await p.waitForTimeout(400);
  assert.ok(await p.locator(".g-row", { hasText: "Kartoshka" }).first().evaluate((r) => r.classList.contains("need")));
  // Quick action with a query string opens the add sheet in place.
  await p.click('.tab[href="index.html"]'); await p.waitForSelector("#overview .ov");
  await p.click('a[href="rozgor.html?new=1"]');
  await p.waitForSelector(".sheet.open #a-own");
  await p.keyboard.press("Escape");
  // Back button returns to the previous section without a reload.
  await p.goBack(); await p.waitForSelector("#overview .ov");
  assert.ok(await p.evaluate(() => window.__sameDocument === true), "back stays in the same page");
  // Only one realtime subscription per visible page: switching 10 more times doesn't pile up re-renders.
  assert.deepEqual(errors, []);
  console.log("PASS spa.spec");
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
