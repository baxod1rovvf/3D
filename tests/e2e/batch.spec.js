// E2E (demo mode, headless): many grocery X taps become ONE notification. Run: node tests/e2e/batch.spec.js
const assert = require("node:assert");
const { chromium } = require("playwright");

const BASE = process.env.BASE || "http://localhost:8765";
const LUCIDE = process.env.LUCIDE_PATH || "/tmp/claude-0/-home-user-3D/600534e3-7512-520f-b92f-9f4302834d42/scratchpad/vendor/package/dist/umd/lucide.min.js";

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const errors = [];
  await ctx.route("**/js/config.js", (r) => r.fulfill({ contentType: "application/javascript", body: "window.OILA_CONFIG={};" }));
  await ctx.route("**/unpkg.com/lucide**", (r) => r.fulfill({ contentType: "application/javascript", path: LUCIDE }));
  await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ contentType: "text/css", body: "" }));
  await ctx.route(/supabase|workers\.dev/, (r) => { errors.push("external call " + r.request().url()); r.abort(); });
  const track = (p) => { p.on("pageerror", (e) => errors.push("pageerror: " + e.message)); return p; };

  const wife = track(await ctx.newPage());
  await wife.goto(BASE + "/kirish.html");
  await wife.fill("#w-name", "Malika");
  await wife.fill("#h-name", "Jasur");
  await wife.click("button[type=submit]");
  await wife.click("#next");
  await wife.waitForSelector(".who button");
  await wife.click('.who button[data-id="u-xotin"]');
  await wife.waitForURL("**/index.html");

  const husb = track(await ctx.newPage());
  await husb.addInitScript(() => { sessionStorage.setItem("oila-family-key", "demo-family"); sessionStorage.setItem("oila-me", "u-er"); });
  await husb.goto(BASE + "/index.html");
  await husb.waitForFunction(() => window.Store && Store.ctx);
  const needs = () => husb.evaluate(async () => (await Store.list("notifications", { asc: true })).filter((n) => n.type === "grocery_need").map((n) => n.body));
  const before = (await needs()).length;

  // X on three products, then un-X one of them — nothing is sent yet.
  await wife.goto(BASE + "/rozgor.html");
  await wife.waitForSelector(".g-row");
  const x = async (name) => { await wife.locator(".g-row", { hasText: name }).first().locator("[data-x]").click(); await wife.waitForTimeout(250); };
  await x("Kartoshka"); await x("Piyoz"); await x("Olma");
  await x("Olma"); // changed her mind
  assert.equal((await needs()).length, before, "nothing is sent while she is still tapping");

  // Leaving the page sends the batch at once.
  await wife.goto(BASE + "/index.html");
  await wife.waitForFunction(() => window.Store && Store.ctx);
  await wife.waitForTimeout(500);
  let got = await needs();
  assert.equal(got.length, before + 1, "exactly one notification for the batch");
  const first = got[got.length - 1];
  assert.match(first, /^Xotiningiz 2 ta mahsulotni kerak deb belgiladi: Kartoshka, Piyoz — /, first);

  // A later batch the same day says "yana"; a single product is named.
  await wife.goto(BASE + "/rozgor.html");
  await wife.waitForSelector(".g-row");
  await x("Olma");
  await wife.evaluate(() => App.flushGroceries()); // same as the 1-minute timer firing
  await wife.waitForTimeout(500);
  got = await needs();
  assert.equal(got.length, before + 2);
  assert.match(got[got.length - 1], /^Xotiningiz yana «Olma»ni kerak deb belgiladi — /, got[got.length - 1]);

  // The 1-minute timer: a tap with a fast clock is sent after 60 s without leaving the page.
  await wife.clock.install();
  await wife.reload();
  await wife.waitForSelector(".g-row");
  await x("Kartoshka"); // un-X (it is needed now)
  await x("Kartoshka"); // X again
  await wife.clock.runFor(61000);
  await wife.waitForTimeout(500);
  got = await needs();
  assert.equal(got.length, before + 3, "timer sends after a minute");

  // The home feed got one line per batch, by name.
  const feed = await wife.evaluate(async () => (await Store.list("activity")).map((a) => a.text));
  assert.ok(feed.some((t) => t.startsWith("Malika 2 ta mahsulotni kerak deb belgiladi: Kartoshka, Piyoz")), feed.join(" | "));

  assert.deepEqual(errors, []);
  console.log("PASS batch.spec: one notification per batch, 'yana' later the same day, 1-minute timer");
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
