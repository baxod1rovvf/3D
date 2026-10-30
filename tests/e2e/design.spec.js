// E2E (demo mode, headless): colorful sections + grocery stickers. Run: node tests/e2e/design.spec.js
const assert = require("node:assert");
const { chromium } = require("playwright");

const BASE = process.env.BASE || "http://localhost:8765";
const LUCIDE = process.env.LUCIDE_PATH || "/tmp/claude-0/-home-user-3D/600534e3-7512-520f-b92f-9f4302834d42/scratchpad/vendor/package/dist/umd/lucide.min.js";
const SHOTS = process.env.SHOTS || "/tmp/claude-0/-home-user-3D/600534e3-7512-520f-b92f-9f4302834d42/scratchpad";

const PAGES = [
  { file: "index.html", section: "home", accent: "#FFB703" },
  { file: "rozgor.html", section: "rozgor", accent: "#2BB673" },
  { file: "taomlar.html", section: "taomlar", accent: "#FF6B3D" },
  { file: "xotiralar.html", section: "xotiralar", accent: "#FF5C8A" },
  { file: "uy-ishlari.html", section: "uy-ishlari", accent: "#6C63FF" },
];

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, reducedMotion: "reduce" });
  const errors = [];
  await ctx.route("**/js/config.js", (r) => r.fulfill({ contentType: "application/javascript", body: "window.OILA_CONFIG={};" }));
  await ctx.route("**/unpkg.com/lucide**", (r) => r.fulfill({ contentType: "application/javascript", path: LUCIDE }));
  await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ contentType: "text/css", body: "" }));
  await ctx.route(/supabase|workers\.dev/, (r) => { errors.push("external call " + r.request().url()); r.abort(); });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

  // Demo setup as the wife.
  await page.goto(BASE + "/kirish.html");
  await page.fill("#w-name", "Malika");
  await page.fill("#h-name", "Jasur");
  await page.click("button[type=submit]");
  await page.click("#next");
  await page.waitForSelector(".who button");
  await page.screenshot({ path: `${SHOTS}/design-kirish.png` });
  await page.click('.who button:has-text("Malika")');
  await page.waitForURL("**/index.html");

  for (const p of PAGES) {
    await page.goto(BASE + "/" + p.file);
    await page.waitForSelector(".tabbar");
    await page.waitForTimeout(400);
    const info = await page.evaluate(() => {
      const app = document.querySelector(".app");
      const cs = getComputedStyle(app);
      const probe = document.createElement("div");
      probe.style.background = "var(--accent-soft)";
      app.appendChild(probe);
      const soft = getComputedStyle(probe).backgroundColor;
      probe.remove();
      const pill = document.querySelector(".tab.active .pill");
      return {
        section: app.dataset.section,
        accent: cs.getPropertyValue("--accent").trim(),
        soft,
        pill: pill && getComputedStyle(pill).backgroundColor,
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        mainOverflow: (() => { const m = document.querySelector(".main"); return m ? m.scrollWidth - m.clientWidth : 0; })(),
      };
    });
    assert.strictEqual(info.section, p.section, `${p.file}: data-section`);
    assert.strictEqual(info.accent.toUpperCase(), p.accent, `${p.file}: --accent`);
    assert.strictEqual(info.pill, info.soft, `${p.file}: active tab pill uses --accent-soft`);
    assert.notStrictEqual(info.soft, "rgba(0, 0, 0, 0)", `${p.file}: --accent-soft defined`);
    assert.ok(info.overflow <= 0, `${p.file}: horizontal page overflow ${info.overflow}px`);
    assert.ok(info.mainOverflow <= 0, `${p.file}: horizontal main overflow ${info.mainOverflow}px`);
    await page.screenshot({ path: `${SHOTS}/design-${p.section}.png` });
  }

  // Ro'zg'or: the Sabzi row wears a carrot sticker.
  await page.goto(BASE + "/rozgor.html");
  await page.waitForSelector(".g-row");
  const carrot = await page.locator(".g-row", { hasText: "Sabzi" }).first().locator(".sticker").textContent();
  assert.strictEqual(carrot.trim(), "🥕", "Sabzi sticker");
  const stickerBox = await page.locator(".g-row .sticker").first().boundingBox();
  assert.ok(Math.round(stickerBox.width) === 44 && Math.round(stickerBox.height) === 44, "sticker is 44px: " + JSON.stringify(stickerBox));

  // Add sheet: live sticker preview while typing.
  await page.click("#add");
  await page.waitForSelector(".sheet.open #g-name");
  await page.fill("#g-name", "olma");
  await page.waitForFunction(() => (document.querySelector(".sheet .sticker-preview") || {}).textContent === "🍎");
  await page.fill("#g-name", "");
  await page.selectOption("#g-cat", "sut");
  await page.waitForFunction(() => (document.querySelector(".sheet .sticker-preview") || {}).textContent === "🧀");
  await page.fill("#g-name", "Sabzi");
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${SHOTS}/design-add-sheet.png` });
  const sheetOverflow = await page.evaluate(() => { const b = document.querySelector(".sheet-body"); return b.scrollWidth - b.clientWidth; });
  assert.ok(sheetOverflow <= 0, "sheet horizontal overflow " + sheetOverflow);
  await page.click(".sheet [data-close]");
  await page.waitForTimeout(400);

  // New row wobbles in, and keeps animating through the debounced realtime re-render (~120ms).
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.click("#add");
  await page.waitForSelector(".sheet.open #g-name");
  await page.fill("#g-name", "Qulupnay");
  await page.selectOption("#g-cat", "meva");
  await page.click(".sheet [data-save]");
  await page.waitForTimeout(300);
  // A redraw re-creates the CSS animation, so its currentTime alone restarts at 0. The effective
  // progress is currentTime minus the (negative) delay: resumed ≈ 300ms, restarted ≈ 180ms.
  const wob = await page.evaluate(() => {
    const r = [...document.querySelectorAll(".g-row")].find((x) => x.textContent.includes("Qulupnay"));
    if (!r) return null;
    const a = r.getAnimations().find((x) => x.animationName === "wobble-in");
    return {
      cls: r.classList.contains("wobble-in"),
      state: a ? a.playState : null,
      progress: a ? a.currentTime - a.effect.getTiming().delay : null,
    };
  });
  console.log("wobble-in at ~300ms:", JSON.stringify(wob));
  assert.ok(wob && wob.cls, "new row keeps .wobble-in ~300ms after save: " + JSON.stringify(wob));
  assert.strictEqual(wob.state, "running", "wobble-in running: " + JSON.stringify(wob));
  assert.ok(wob.progress >= 250, "wobble-in resumed (progress >= 250ms), not restarted: " + JSON.stringify(wob));
  await page.emulateMedia({ reducedMotion: "reduce" });

  // Taomlar: ingredient chips carry stickers.
  await page.goto(BASE + "/taomlar.html");
  await page.waitForSelector(".ings .chip"); // demo seed: today's "Tovuq sho'rva" uses Sabzi
  const chip = await page.locator(".ings .chip", { hasText: "Sabzi" }).first().textContent();
  assert.ok(chip.includes("🥕"), "ingredient chip sticker: " + chip);

  // Home: recent activity naming a product in «…» shows its sticker.
  // Seed has Sabzi already "kerak": un-mark, then mark again so the wife's activity names it.
  await page.goto(BASE + "/rozgor.html");
  await page.waitForSelector(".g-row");
  for (let k = 0; k < 2; k++) {
    await page.locator(".g-row", { hasText: "Sabzi" }).first().locator("[data-x]").click();
    await page.waitForTimeout(500);
  }
  await page.goto(BASE + "/index.html");
  await page.waitForSelector("#activity .row");
  const actSticker = await page.locator("#activity .row", { hasText: "«Sabzi»" }).first().locator(".sticker").textContent();
  assert.strictEqual(actSticker.trim(), "🥕", "activity sticker");
  await page.evaluate(() => { const m = document.querySelector(".main"); m.scrollTop = m.scrollHeight; });
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${SHOTS}/design-home-activity.png` });

  assert.deepStrictEqual(errors, [], errors.join("\n"));
  await browser.close();
  console.log("PASS design.spec.js");
})().catch((e) => { console.error("FAIL", e); process.exit(1); });
