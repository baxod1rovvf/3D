// E2E (demo mode, headless): settings (install, notifications, meal times). Run: node tests/e2e/settings.spec.js
const assert = require("node:assert");
const { chromium } = require("playwright");

const BASE = process.env.BASE || "http://localhost:8765";
const LUCIDE = process.env.LUCIDE_PATH || "/tmp/claude-0/-home-user-3D/600534e3-7512-520f-b92f-9f4302834d42/scratchpad/vendor/package/dist/umd/lucide.min.js";
const SHOT = "/tmp/claude-0/-home-user-3D/600534e3-7512-520f-b92f-9f4302834d42/scratchpad/settings.png";

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 375, height: 760 } });
  await ctx.route("**/js/config.js", (r) => r.fulfill({ contentType: "application/javascript", body: "window.OILA_CONFIG={};" }));
  await ctx.route("**/unpkg.com/lucide**", (r) => r.fulfill({ contentType: "application/javascript", path: LUCIDE }));
  await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ contentType: "text/css", body: "" }));
  await ctx.route(/supabase|workers\.dev/, (r) => { errors.push("external call " + r.request().url()); r.abort(); });
  const track = (p) => { p.on("pageerror", (e) => errors.push("pageerror: " + e.message)); return p; };

  const page = track(await ctx.newPage());
  await page.goto(BASE + "/kirish.html");
  await page.fill("#w-name", "Malika");
  await page.fill("#h-name", "Jasur");
  await page.click("button[type=submit]");
  await page.click("#next");
  await page.waitForSelector(".who button");
  await page.click('.who button[data-id="u-xotin"]');
  await page.waitForURL("**/index.html");
  await page.waitForFunction(() => window.Store && Store.ctx);

  // Defaults.
  const def = await page.evaluate(() => Store.getSettings());
  assert.deepStrictEqual([def.breakfast, def.lunch, def.dinner, def.leadHours], ["08:00", "13:00", "19:00", 2]);

  // Open settings; sections in order.
  await page.click("#settings-btn");
  await page.waitForSelector("[data-set-dinner]");
  const heads = await page.$$eval(".sheet h2, .sheet .section-head", (els) => els.map((e) => e.textContent.trim()));
  const order = ["Ilovani o'rnatish", "Bildirishnomalar", "Ovqat vaqtlari", "Qurilmalar"].map((t) => heads.findIndex((h) => h.includes(t)));
  assert.ok(order.every((i) => i >= 0) && order.every((v, i) => i === 0 || v > order[i - 1]), "section order " + order + " " + heads);

  // Install row shows one of the four states.
  const inst = await page.textContent("[data-install-row]");
  assert.ok(/O'rnatilgan|O'rnatish|Ulashish|Bosh ekran|qo'llab|brauzer/i.test(inst), "install row: " + inst);

  // Notifications row (demo: no server).
  const notif = await page.textContent("[data-push-row]");
  assert.ok(/server|sozlanmagan/i.test(notif), "push status: " + notif);

  // Test button creates a self notification of type "test".
  const before = await page.evaluate(async () => (await Store.list("notifications")).length);
  await page.click("[data-push-test]");
  await page.waitForFunction(async (n) => (await Store.list("notifications")).length > n, before);
  const last = await page.evaluate(async () => (await Store.list("notifications"))[0]);
  assert.strictEqual(last.type, "test");
  assert.strictEqual(last.recipient_id, "u-xotin");

  // Meal times + lead.
  await page.fill("[data-set-dinner]", "20:30");
  await page.dispatchEvent("[data-set-dinner]", "change");
  await page.click('[data-lead] input[value="3"] + span');
  await page.waitForTimeout(300);
  await page.screenshot({ path: SHOT });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth || (document.querySelector(".sheet").scrollWidth > document.querySelector(".sheet").clientWidth));
  assert.ok(!overflow, "horizontal overflow");
  await page.reload();
  await page.waitForFunction(() => window.Store && Store.ctx);
  const s = await page.evaluate(() => Store.getSettings());
  assert.strictEqual(s.dinner, "20:30");
  assert.strictEqual(s.leadHours, 3);
  assert.ok(s.timezone, "timezone saved");
  await page.click("#settings-btn");
  await page.waitForSelector("[data-set-dinner]");
  assert.strictEqual(await page.inputValue("[data-set-dinner]"), "20:30");
  assert.strictEqual(await page.isChecked('[data-lead] input[value="3"]'), true);

  // Off.
  await page.click('[data-lead] input[value="0"] + span');
  await page.waitForTimeout(200);
  assert.strictEqual((await page.evaluate(() => Store.getSettings())).leadHours, 0);

  // No PushManager.
  const p2 = track(await ctx.newPage());
  await p2.addInitScript(() => { delete window.PushManager; });
  await p2.goto(BASE + "/index.html");
  await p2.waitForFunction(() => window.Store && Store.ctx);
  await p2.click("#settings-btn");
  await p2.waitForSelector("[data-push-row]");
  assert.ok((await p2.textContent("[data-push-row]")).includes("Bu brauzer bildirishnomalarni qo'llamaydi"));

  // Push subscription follows the person / is removed on disconnect (fake pushManager + store spies).
  const p3 = track(await ctx.newPage());
  await p3.addInitScript(() => {
    const sub = { endpoint: "https://push.example/abc", toJSON() { return { endpoint: this.endpoint, keys: {} }; }, unsubscribe() { window.__unsub = (window.__unsub || 0) + 1; return Promise.resolve(true); } };
    const reg = { pushManager: { getSubscription: () => Promise.resolve(window.__unsub ? null : sub), subscribe: () => Promise.resolve(sub) } };
    Object.defineProperty(navigator.serviceWorker, "ready", { get: () => Promise.resolve(reg) });
    window.__calls = JSON.parse(sessionStorage.getItem("__calls") || "[]");
  });
  await p3.goto(BASE + "/index.html");
  await p3.waitForFunction(() => window.Store && Store.ctx);
  await p3.evaluate(() => {
    const log = (c) => { window.__calls.push(c); sessionStorage.setItem("__calls", JSON.stringify(window.__calls)); };
    Store.savePushSubscription = async (s) => log(["save", s.endpoint, Store.Device.me()]);
    Store.deletePushSubscription = async (e) => log(["del", e]);
  });
  await p3.click("#settings-btn");
  await p3.click("[data-switch]");
  await p3.waitForLoadState("load");
  await p3.waitForFunction(() => window.Store && Store.ctx && Store.ctx.profile.id === "u-er");
  const c1 = await p3.evaluate(() => JSON.parse(sessionStorage.getItem("__calls")));
  assert.deepStrictEqual(c1, [["save", "https://push.example/abc", "u-er"]]);
  await p3.evaluate(() => {
    const log = (c) => { window.__calls.push(c); sessionStorage.setItem("__calls", JSON.stringify(window.__calls)); };
    Store.deletePushSubscription = async (e) => log(["del", e]);
  });
  await p3.click("#settings-btn");
  await p3.click("[data-out]");
  await p3.click(".sheet .btn.danger, .sheet [data-ok], .sheet .btn.primary");
  await p3.waitForURL("**/kirish.html");
  const c2 = await p3.evaluate(() => JSON.parse(sessionStorage.getItem("__calls")));
  assert.deepStrictEqual(c2[c2.length - 1], ["del", "https://push.example/abc"]);

  // Hanging push APIs must not block switch / disconnect.
  const p4 = track(await ctx.newPage());
  await p4.addInitScript(() => {
    if (!sessionStorage.getItem("oila-me")) { sessionStorage.setItem("oila-family-key", "demo-family"); sessionStorage.setItem("oila-me", "u-xotin"); }
    const never = new Promise(() => {});
    Object.defineProperty(navigator.serviceWorker, "ready", { get: () => Promise.resolve({ pushManager: { getSubscription: () => never } }) });
  });
  await p4.goto(BASE + "/index.html");
  await p4.waitForFunction(() => window.Store && Store.ctx);
  const was = await p4.evaluate(() => Store.ctx.profile.id);
  await p4.click("#settings-btn");
  await p4.click("[data-switch]");
  await p4.waitForFunction((id) => window.Store && Store.ctx && Store.ctx.profile.id !== id, was, { timeout: 6000 });
  await p4.click("#settings-btn");
  await p4.click("[data-out]");
  await p4.click(".sheet .btn.danger, .sheet [data-ok], .sheet .btn.primary");
  await p4.waitForURL("**/kirish.html", { timeout: 6000 });

  await browser.close();
  assert.deepStrictEqual(errors, []);
  console.log("settings.spec OK");
})().catch((e) => { console.error(e); process.exit(1); });
