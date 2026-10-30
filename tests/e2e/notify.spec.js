// E2E (demo mode, headless): typed notifications. Run: node tests/e2e/notify.spec.js
const assert = require("node:assert");
const { chromium } = require("playwright");

const BASE = process.env.BASE || "http://localhost:8765";
const LUCIDE = "/tmp/claude-0/-home-user-3D/600534e3-7512-520f-b92f-9f4302834d42/scratchpad/vendor/package/dist/umd/lucide.min.js";

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const errors = [];
  await ctx.route("**/js/config.js", (r) => r.fulfill({ contentType: "application/javascript", body: "window.OILA_CONFIG={};" }));
  await ctx.route("**/unpkg.com/lucide**", (r) => r.fulfill({ contentType: "application/javascript", path: LUCIDE }));
  await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ contentType: "text/css", body: "" }));
  await ctx.route(/supabase|workers\.dev/, (r) => { errors.push("external call " + r.request().url()); r.abort(); });
  const track = (p) => { p.on("pageerror", (e) => errors.push("pageerror: " + e.message)); return p; };

  // Setup via welcome page; pick the wife.
  const wife = track(await ctx.newPage());
  await wife.goto(BASE + "/kirish.html");
  await wife.fill("#w-name", "Malika");
  await wife.fill("#h-name", "Jasur");
  await wife.click("button[type=submit]");
  await wife.click("#next");
  await wife.waitForSelector(".who button");
  await wife.click('.who button[data-id="u-xotin"]');
  await wife.waitForURL("**/index.html");

  // Husband page (second tab, same localStorage).
  const husb = track(await ctx.newPage());
  await husb.addInitScript(() => { sessionStorage.setItem("oila-family-key", "demo-family"); sessionStorage.setItem("oila-me", "u-er"); });
  await husb.goto(BASE + "/index.html");
  await husb.waitForFunction(() => window.Store && Store.ctx);

  // Wife: second task due today, so "all done" needs two completions.
  await wife.goto(BASE + "/uy-ishlari.html");
  await wife.waitForFunction(() => window.Store && Store.ctx);
  await wife.evaluate(async () => {
    await Store.insert("tasks", { household_id: "demo-family", title: "Gul sug'orish", description: "", assignee_id: "u-xotin", due_date: App.today(), priority: "orta", done: false, completed_by: null, completed_at: null, reminded: false, created_by: "u-xotin" });
  });
  await wife.reload();
  await wife.waitForSelector(".task");

  // 1) Grocery X on Kartoshka.
  await wife.goto(BASE + "/rozgor.html");
  await wife.waitForSelector(".g-row");
  const row = wife.locator(".g-row", { hasText: "Kartoshka" }).first();
  await row.locator("[data-x]").click();
  await wife.waitForTimeout(500);

  // 2) Complete both tasks, then un-tick one and re-tick.
  await wife.goto(BASE + "/uy-ishlari.html");
  await wife.waitForSelector(".task");
  const tick = async (title) => {
    await wife.locator(".task", { hasText: title }).first().locator("[data-check]").click();
    await wife.waitForTimeout(1300);
  };
  await tick("Kirlarni yuvish");
  await tick("Gul sug'orish");
  await wife.click('[data-view="done"]');
  await tick("Gul sug'orish"); // un-tick: must notify nobody
  await wife.click('[data-view="today"]');
  await tick("Gul sug'orish"); // re-tick: one more tasks_all_done

  const readFor = async (page, tbl) => page.evaluate((t) => Store.list(t), tbl);
  const notes = await readFor(husb, "notifications");
  const by = (type) => notes.filter((n) => n.type === type);

  const need = by("grocery_need");
  assert.ok(need.length === 1 && need[0].body.includes("Xotiningiz «Kartoshka»ni kerak deb belgiladi — "), "grocery_need body: " + JSON.stringify(need));
  assert.strictEqual(need[0].module, "grocery");
  assert.ok(need[0].title && need[0].tag === "grocery_need" && need[0].text === need[0].body);
  assert.strictEqual(by("task_done").length, 3, "task_done x3 (2 + re-tick), got " + by("task_done").length);
  assert.strictEqual(by("tasks_all_done").length, 2, "tasks_all_done x2, got " + by("tasks_all_done").length);
  assert.strictEqual(by("task_done")[0].module, "tasks");

  const wifeNotes = await readFor(wife, "notifications");
  assert.strictEqual(wifeNotes.filter((n) => n.actor_id === "u-xotin").length, 0, "wife got own notifications");
  const act = await wife.evaluate(() => Store.list("activity"));
  assert.ok(act.some((a) => a.module === "grocery" && a.text === "Xotiningiz «Kartoshka»ni kerak deb belgiladi"), "activity fixed text");

  assert.deepStrictEqual(errors, [], errors.join("\n"));
  await browser.close();
  console.log("PASS notify.spec.js");
})().catch((e) => { console.error("FAIL", e); process.exit(1); });
