// E2E (demo mode, headless): Ro'zg'or search. Run: node tests/e2e/search.spec.js
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
  await p.goto(BASE + "/rozgor.html"); await p.waitForSelector(".g-row");
  const names = () => p.$$eval(".g-row .title", (els) => els.map((e) => e.textContent.trim()));

  await p.fill("#q", "kart");
  assert.deepEqual(await names(), ["Kartoshka"]);
  await p.fill("#q", "MOL GO‘SHT"); // other case and apostrophe
  assert.deepEqual(await names(), ["Mol go'shti"]);
  await p.click('[data-view="need"]'); await p.fill("#q", "sut");
  assert.deepEqual(await names(), ["Sut"], "search works inside Kerak too");
  await p.click('[data-view="all"]');
  await p.fill("#q", "ananas");
  assert.ok(await p.isVisible("#add-found"), "nothing found → offer to add it");
  await p.click("#add-found"); await p.waitForTimeout(400);
  assert.equal(await p.inputValue("#g-name"), "ananas");
  await p.keyboard.press("Escape"); await p.waitForTimeout(300);
  await p.click("#q-clear");
  assert.ok((await names()).length > 10, "clearing shows everything again");
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.deepEqual(errors, []);
  console.log("PASS search.spec");
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
