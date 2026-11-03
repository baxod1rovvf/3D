// E2E (demo mode, headless): Sozlamalar → "Orqaga" deletes everything and both phones start from zero.
// Run: node tests/e2e/reset.spec.js
const assert = require("node:assert");
const { chromium } = require("playwright");

const BASE = process.env.BASE || "http://localhost:8765";
const LUCIDE = process.env.LUCIDE_PATH || "/tmp/claude-0/-home-user-3D/600534e3-7512-520f-b92f-9f4302834d42/scratchpad/vendor/package/dist/umd/lucide.min.js";

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 375, height: 800 } });
  await ctx.route("**/js/config.js", (r) => r.fulfill({ contentType: "application/javascript", body: "window.OILA_CONFIG={};" }));
  await ctx.route("**/unpkg.com/lucide**", (r) => r.fulfill({ contentType: "application/javascript", path: LUCIDE }));
  await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ contentType: "text/css", body: "" }));
  await ctx.route(/supabase|workers\.dev/, (r) => { errors.push("external call " + r.request().url()); r.abort(); });
  const track = (p) => { p.on("pageerror", (e) => errors.push("pageerror: " + e.message)); return p; };
  const oilaKeys = (p) => p.evaluate(() => [...Object.keys(localStorage), ...Object.keys(sessionStorage)].filter((k) => k.startsWith("oila-")));

  // Wife sets up the family; the husband's "phone" is a second tab on the same demo data.
  const p = track(await ctx.newPage());
  await p.goto(BASE + "/kirish.html");
  await p.fill("#w-name", "Malika"); await p.fill("#h-name", "Jasur"); await p.fill("#f-name", "Karimovlar");
  await p.click("button[type=submit]"); await p.click("#next");
  await p.click('.who button[data-id="u-xotin"]'); await p.waitForURL("**/index.html");
  await p.waitForFunction(() => window.Store && Store.ctx);
  await p.evaluate(async () => {
    await Store.insert("grocery_items", { name: "Asal", category: "boshqa", status: "kerak" });
    localStorage.setItem("oila-theme", "dark");
    localStorage.setItem("oila-quiet", JSON.stringify({ on: true, from: "22:00", to: "06:00" }));
  });
  const p2 = track(await ctx.newPage());
  await p2.goto(BASE + "/rozgor.html"); await p2.waitForSelector(".g-row");

  // The button sits in its own section after "Qurilmalar".
  await p.click("#settings-btn"); await p.waitForSelector("[data-reset]");
  const heads = await p.$$eval(".sheet .section-head", (els) => els.map((e) => e.textContent.trim()));
  const iDev = heads.findIndex((h) => h.includes("Qurilmalar")), iReset = heads.findIndex((h) => h.includes("Boshidan boshlash"));
  assert.ok(iDev >= 0 && iReset > iDev, "reset section after Qurilmalar: " + heads);
  assert.strictEqual((await p.textContent("[data-reset]")).trim(), "Orqaga");

  // The confirm names the family, focuses Cancel, and Escape keeps everything.
  await p.click("[data-reset]");
  await p.waitForSelector(".sheet.open [data-ok]");
  assert.match(await p.textContent(".sheet.open .sheet-head h3"), /«Karimovlar» butunlay o'chirilsinmi\?/);
  assert.strictEqual((await p.textContent(".sheet.open [data-ok]")).trim(), "Hammasini o'chirish");
  await p.waitForFunction(() => document.activeElement && document.activeElement.textContent.trim() === "Bekor qilish");
  await p.keyboard.press("Escape"); await p.waitForTimeout(400);
  assert.ok(p.url().endsWith("/index.html"), "still home after cancel: " + p.url());
  assert.ok(await p.evaluate(async () => (await Store.list("grocery_items")).some((g) => g.name === "Asal")), "data kept after cancel");

  // Confirm: everything goes, this tab and the partner's tab land on the welcome screen.
  await p.click("#settings-btn"); await p.waitForSelector("[data-reset]");
  await p.click("[data-reset]");
  await p.waitForSelector(".sheet.open [data-ok]");
  await p.click(".sheet.open [data-ok]");
  await p.waitForURL("**/kirish.html", { timeout: 10000 });
  await p2.waitForURL("**/kirish.html", { timeout: 10000 });
  for (const tab of [p, p2]) {
    await tab.waitForSelector("#f [name=wife]");
    assert.match(await tab.textContent("[data-reset-note]"), /Hammasi o'chirildi/);
    assert.ok(!tab.url().includes("reset"), "reset flag dropped from the address: " + tab.url());
  }
  assert.deepStrictEqual(await oilaKeys(p), [], "nothing of the app left on this phone");
  assert.strictEqual(await p.evaluate(() => document.documentElement.dataset.theme), undefined, "theme back to Avto");
  assert.strictEqual(await p.evaluate(async () => Store.session()), null, "no family any more");

  // Opening an app page now goes to the welcome screen, and a reload shows no reset note.
  await p.goto(BASE + "/index.html"); await p.waitForURL("**/kirish.html");
  await p.waitForSelector("#f [name=wife]");
  assert.strictEqual(await p.$("[data-reset-note]"), null);

  // A brand-new family starts clean.
  await p.fill("#w-name", "Dilnoza"); await p.fill("#h-name", "Sardor");
  await p.click("button[type=submit]"); await p.click("#next");
  await p.click('.who button[data-id="u-er"]'); await p.waitForURL("**/index.html");
  await p.waitForFunction(() => window.Store && Store.ctx);
  const fresh = await p.evaluate(async () => ({ me: Store.ctx.profile.full_name, name: Store.ctx.household.name, asal: (await Store.list("grocery_items")).some((g) => g.name === "Asal") }));
  assert.deepStrictEqual(fresh, { me: "Sardor", name: "Bizning uy", asal: false });

  assert.deepStrictEqual(errors, []);
  await browser.close();
  console.log("reset.spec OK");
})().catch((e) => { console.error(e); process.exit(1); });
