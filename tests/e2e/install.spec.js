// E2E (demo mode, headless): installable app. Run: node tests/e2e/install.spec.js
const assert = require("node:assert");
const { chromium } = require("playwright");

const BASE = process.env.BASE || "http://localhost:8765";
const LUCIDE = process.env.LUCIDE_PATH || "/tmp/claude-0/-home-user-3D/600534e3-7512-520f-b92f-9f4302834d42/scratchpad/vendor/package/dist/umd/lucide.min.js";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";

async function setup(ctx, errors) {
  await ctx.route("**/js/config.js", (r) => r.fulfill({ contentType: "application/javascript", body: "window.OILA_CONFIG={};" }));
  await ctx.route("**/unpkg.com/lucide**", (r) => r.fulfill({ contentType: "application/javascript", path: LUCIDE }));
  await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ contentType: "text/css", body: "" }));
  await ctx.route(/supabase|workers\.dev/, (r) => { errors.push("external call " + r.request().url()); r.abort(); });
}
const track = (p, errors) => { p.on("pageerror", (e) => errors.push("pageerror: " + e.message)); return p; };

(async () => {
  const browser = await chromium.launch();
  const errors = [];

  // ---- Android/desktop Chrome context ----
  const ctx = await browser.newContext();
  await setup(ctx, errors);
  const page = track(await ctx.newPage(), errors);
  await page.goto(BASE + "/kirish.html");

  // Service worker registers (also on the welcome page, which does not use App.boot).
  await page.waitForFunction(() => navigator.serviceWorker.getRegistration().then((r) => !!r));
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).scope);
  assert.ok(scope.endsWith("/"), "scope " + scope);
  await page.evaluate(() => navigator.serviceWorker.ready);
  const caches1 = await page.evaluate(async () => caches.keys());
  assert.ok(caches1.includes("oila-v2"), "cache oila-v2 missing: " + caches1);

  // Manifest icons.
  const manifestHref = await page.evaluate(() => document.querySelector('link[rel="manifest"]').href);
  const manifest = await (await ctx.request.get(manifestHref)).json();
  assert.strictEqual(manifest.id, "./");
  for (const size of ["192x192", "512x512"]) {
    const ic = manifest.icons.find((i) => i.sizes === size && i.type === "image/png");
    assert.ok(ic, "manifest missing png " + size);
    assert.ok(!ic.src.startsWith("/"), "icon src must be relative: " + ic.src);
    const res = await ctx.request.get(new URL(ic.src, manifestHref).href);
    assert.strictEqual(res.status(), 200, ic.src);
  }
  assert.ok(manifest.icons.some((i) => i.purpose === "maskable" && i.sizes === "512x512"), "maskable icon missing");
  assert.strictEqual((await ctx.request.get(BASE + "/sw.js")).status(), 200);

  // beforeinstallprompt -> "prompt"; install() uses the stored event.
  assert.strictEqual(await page.evaluate(() => App.installState()), "unsupported");
  const outcome = await page.evaluate(async () => {
    const ev = new Event("beforeinstallprompt", { cancelable: true });
    ev.prompt = () => { window.__prompted = true; return Promise.resolve(); };
    ev.userChoice = Promise.resolve({ outcome: "accepted" });
    window.dispatchEvent(ev);
    const state = App.installState();
    const out = await App.install();
    return { state, out, prompted: window.__prompted, after: App.installState() };
  });
  assert.strictEqual(outcome.state, "prompt");
  assert.strictEqual(outcome.prompted, true);
  assert.strictEqual(outcome.out, "accepted");
  assert.notStrictEqual(outcome.after, "prompt");

  // Standalone display mode -> "installed".
  const sa = await ctx.newPage();
  await sa.emulateMedia({ media: "screen" });
  await sa.addInitScript(() => {
    const mm = window.matchMedia.bind(window);
    window.matchMedia = (q) => (q.includes("display-mode: standalone") ? { matches: true, media: q, addEventListener() {}, removeEventListener() {} } : mm(q));
  });
  track(sa, errors);
  await sa.goto(BASE + "/kirish.html");
  assert.strictEqual(await sa.evaluate(() => App.installState()), "installed");

  // Network passthrough: the SW must not cache supabase or non-GET (checked via cache contents).
  const keys = await page.evaluate(async () => (await (await caches.open("oila-v2")).keys()).map((r) => r.url));
  assert.ok(keys.length > 0 && keys.every((u) => !/supabase\.co/.test(u) && !/unpkg|googleapis/.test(u)), "bad cache entries: " + keys);

  // Offline: a visited page still opens from cache.
  await page.goto(BASE + "/kirish.html");
  await ctx.setOffline(true);
  const off = await ctx.newPage();
  await off.goto(BASE + "/kirish.html").catch(() => {});
  assert.ok(await off.evaluate(() => !!document.querySelector("#logo")), "offline navigation should be served from cache");
  await ctx.setOffline(false);

  // ---- iPhone Safari UA ----
  const ictx = await browser.newContext({ userAgent: IPHONE });
  await setup(ictx, errors);
  const ip = track(await ictx.newPage(), errors);
  await ip.goto(BASE + "/kirish.html");
  assert.strictEqual(await ip.evaluate(() => App.installState()), "ios");

  assert.deepStrictEqual(errors, [], errors.join("\n"));
  await browser.close();
  console.log("PASS install.spec.js");
})().catch((e) => { console.error("FAIL", e); process.exit(1); });
