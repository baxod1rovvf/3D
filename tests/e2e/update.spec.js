// E2E (demo mode, headless): new versions reach the phone. Run: node tests/e2e/update.spec.js
// Starts its own static server that, like GitHub Pages, sends "Cache-Control: max-age=600", and can
// "deploy" a new version: js/app.js gets a different window.__deploy, and sw.js can get a new CACHE.
const assert = require("node:assert");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "../..");
const PORT = Number(process.env.UPDATE_PORT || 8766);
const BASE = `http://localhost:${PORT}`;
const LUCIDE = process.env.LUCIDE_PATH || "/tmp/claude-0/-home-user-3D/600534e3-7512-520f-b92f-9f4302834d42/scratchpad/vendor/package/dist/umd/lucide.min.js";
const TYPES = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json" };

const live = { deploy: 1, cache: null, slow: false }; // what the server currently serves
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const hits = {};
const server = http.createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, BASE).pathname);
  if (p.endsWith("/")) p += "index.html";
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  let body = fs.readFileSync(file);
  if (p === "/js/app.js") body = Buffer.concat([body, Buffer.from(`\n;window.__deploy = ${live.deploy};\n`)]);
  if (p === "/sw.js" && live.cache) body = Buffer.from(body.toString().replace(/const CACHE = "oila-v\d+";/, `const CACHE = "${live.cache}";`));
  hits[p] = (hits[p] || 0) + 1;
  if (live.slow && p === "/js/app.js") await wait(1500); // a slow network: background refreshes finish late
  res.writeHead(200, { "Content-Type": TYPES[path.extname(p)] || "application/octet-stream", "Cache-Control": "max-age=600" });
  res.end(body);
});

(async () => {
  await new Promise((r) => server.listen(PORT, r));
  const browser = await chromium.launch();
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 375, height: 800 } });
  await ctx.route("**/js/config.js", (r) => r.fulfill({ contentType: "application/javascript", body: "window.OILA_CONFIG={};" }));
  await ctx.route("**/unpkg.com/lucide**", (r) => r.fulfill({ contentType: "application/javascript", path: LUCIDE }));
  await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ contentType: "text/css", body: "" }));
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  const deployOnPage = () => p.evaluate(() => window.__deploy);
  const settings = async () => { await p.click("#settings-btn"); await p.waitForSelector("[data-refresh]"); };

  // Deploy 1 installed: family set up, the service worker controls the page.
  await p.goto(BASE + "/kirish.html");
  await p.fill("#w-name", "Malika"); await p.fill("#h-name", "Jasur");
  await p.click("button[type=submit]"); await p.click("#next");
  await p.click('.who button[data-id="u-xotin"]'); await p.waitForURL("**/index.html");
  await p.waitForFunction(() => navigator.serviceWorker.controller);
  await p.reload(); await p.waitForSelector(".topbar");
  assert.strictEqual(await deployOnPage(), 1);
  assert.deepStrictEqual(await p.evaluate(() => caches.keys().then((k) => k.filter((n) => n.startsWith("oila-v")))), ["oila-v6"]);

  // The card sits near the top of Settings and shows the running version.
  await settings();
  const heads = await p.$$eval(".sheet .section-head", (els) => els.map((e) => e.textContent.trim()));
  assert.ok(heads[0].includes("Yangilash"), "Yangilash is the first section: " + heads);
  await p.waitForFunction(() => /Hozirgi versiya: v6\./.test(document.querySelector("[data-version]").textContent));
  await p.click(".sheet [data-close]"); await p.waitForTimeout(350);

  // Deploy 2 changes only app.js. Opening the app normally still shows the old code (served from
  // the caches; the background refresh only helps on a later open)...
  live.deploy = 2;
  await p.goto(BASE + "/rozgor.html"); await p.waitForSelector(".topbar");
  assert.strictEqual(await deployOnPage(), 1, "an open alone serves the cached version");

  // ...Yangilash gets the newest straight away, past both the service worker and the browser's HTTP
  // cache. (Deploy 3 lands just before the tap, so a plain reload would show 1 or 2, never 3.)
  live.deploy = 3;
  const before = hits["/js/app.js"];
  await settings();
  live.slow = true;
  await Promise.all([p.waitForEvent("load"), p.click("[data-refresh]")]);
  live.slow = false;
  await p.waitForSelector(".topbar");
  assert.strictEqual(await deployOnPage(), 3, "Yangilash loads the new version");
  assert.ok(hits["/js/app.js"] > before, "app.js was fetched from the server");
  assert.ok(await p.evaluate(async () => (await Store.list("grocery_items")).length > 0), "data still there after refresh");

  // Offline: the button says so and the page stays as it is.
  await settings();
  await ctx.setOffline(true);
  await p.click("[data-refresh]");
  await p.waitForSelector(".toast", { hasText: "Yangilab bo'lmadi" });
  assert.strictEqual(await p.isDisabled("[data-refresh]"), false, "button usable again");
  assert.strictEqual(await deployOnPage(), 3);
  // A browser reload while offline still opens the app from the cache.
  await p.reload(); await p.waitForSelector(".topbar");
  assert.strictEqual(await deployOnPage(), 3, "offline reload served from cache");
  await ctx.setOffline(false);

  // Deploy 4 with a new sw.js: the app comes back on screen 11 minutes later, finds the new version
  // and reloads itself into it. Nobody taps anything.
  live.deploy = 4; live.cache = "oila-v7";
  await Promise.all([
    p.waitForEvent("load", { timeout: 15000 }),
    p.evaluate(() => { const later = Date.now() + 11 * 60 * 1000; Date.now = () => later; document.dispatchEvent(new Event("visibilitychange")); }),
  ]);
  await p.waitForSelector(".topbar");
  assert.strictEqual(await deployOnPage(), 4, "new service worker reloads the app into the new version");
  assert.deepStrictEqual(await p.evaluate(() => caches.keys().then((k) => k.filter((n) => n.startsWith("oila-v")))), ["oila-v7"]);
  await settings();
  await p.waitForFunction(() => /v7/.test(document.querySelector("[data-version]").textContent));

  assert.deepStrictEqual(errors, []);
  await browser.close();
  server.close();
  console.log("PASS update.spec: Yangilash, offline refusal, automatic reload on a new version");
})().catch((e) => { console.error("FAIL", e); server.close(); process.exit(1); });
