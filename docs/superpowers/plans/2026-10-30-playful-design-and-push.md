# Playful Design, Stickers, Install & Push Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Oila Uchun colorful and playful, add grocery emoji stickers, make it installable, and send real push notifications for partner activity and meal reminders.

**Architecture:**
- Three pure modules are shared by the browser and the Edge Function:
  - `js/stickers.js`: name → emoji
  - `js/messages.js`: event → title, body and vibration
  - `js/reminders.js`: meal reminder timing

  They are plain scripts that attach to `globalThis`.
- The client writes `notifications` rows through a new `Store.notify`.
- A Postgres trigger and a `pg_cron` job call the Supabase Edge Function `push`. It sends Web Push to subscriptions saved from Settings, and `sw.js` displays them.

**Tech Stack:**
- Static HTML/CSS/JS, Supabase (Postgres 15+, `pg_net`, `pg_cron`, Edge Functions on Deno with `npm:web-push@3.6.7`)
- Service Worker + Push API
- Tests: Node test runner (`node --test`), Playwright (preinstalled), local PostgreSQL 16

**Spec:** `docs/superpowers/specs/2026-10-30-playful-design-and-push-design.md`

## Global Constraints

- **Section accents:**

  | Section | Color |
  |---|---|
  | Home | `#FFB703` |
  | Ro'zg'or | `#2BB673` |
  | Taomlar | `#FF6B3D` |
  | Xotiralar | `#FF5C8A` |
  | Uy ishlari | `#6C63FF` |

- **Fonts:** headings use Fredoka and body text uses Nunito (Google Fonts).
- **Stickers:** at least 70 entries. The longest matching word wins. Fallbacks by category:

  | Category | Emoji |
  |---|---|
  | sabzavot | 🥬 |
  | meva | 🍓 |
  | sut | 🧀 |
  | gosht | 🍖 |
  | non | 🥖 |
  | ichimlik | 🧃 |
  | uy | 🧴 |
  | boshqa | 🛒 |

- **Message types and title emojis:**

  | Type | Emoji |
  |---|---|
  | `grocery_need` | 🛒 |
  | `grocery_bought` | 🛍️ |
  | `task_done` | ✨ |
  | `tasks_all_done` | 💐 |
  | `task_assigned` | 📋 |
  | `meal_added` | 🍽️ |
  | `memory_added` | 📸 |
  | `meal_reminder` | 🍳 |
  | `test` | 🔔 |

- **Message text:** body = fixed part + `" — "` + a random ending. Each type has at least 5 endings per role, and `tasks_all_done` has at least 8 per role. Role words are "Xotiningiz" (actor is `xotin`) and "Eringiz" (actor is `er`).
- **Vibration:** base `[120, 60, 120, 200, 120, 60, 120, 60, 260]`.
- **Meal defaults:** breakfast 08:00, lunch 13:00, dinner 19:00. `meal_lead_hours` is 0 (off) to 3, default 2.
- **Meal reminder window:** [reminder time, +10 min). The cron runs every 5 min. Each reminder is sent once, enforced by a unique key.
- **Self-notification:** only `test` notifies yourself.
- **Edge Function:** a single pasteable file `supabase/functions/push/index.ts`, with "Verify JWT" off. It must be safe to call publicly.
- **Copy:** all UI text is in Uzbek Latin.
- **External scripts:** pin exact versions. Lucide is `0.454.0`, supabase-js is `2.117.0`.

## Review Focus

1. **Grocery names with odd apostrophes or casing** ("O‘rik", "OLMA", "Sut ") should still get the right sticker. → Task 1 tests.
2. **The partner has no push subscription yet** (app not installed or notifications off). The in-app notification row must still be created, and the function must answer 200 with `sent: 0`, not crash. → Task 8 test.
3. **Meal times just before midnight with a 3-hour lead** (dinner 01:00 → reminder 22:00 the previous day). It must fire at the right day and only once. → Task 3 tests.
4. **The last open task is completed, then un-ticked, then ticked again.** "All done" must be sent again only if the tasks really are all done again; un-ticking sends nothing. → Task 4 test.
5. **Settings opened on a browser without Push or Service Worker support** (iOS Safari not installed, or desktop Firefox private window). Settings must show a clear message and must not throw. → Task 7 test.

---

### Task 1: Grocery stickers

**Files:**
- Create: `js/stickers.js`
- Test: `tests/stickers.test.js`

**Interfaces:**
- Produces:
  - `globalThis.Stickers.forName(name: string, category?: string) → string` (an emoji)
  - `Stickers.normalize(s: string) → string`
  - `Stickers.LIST: Array<{emoji, words: string[]}>`

- [ ] **Step 1: Write failing tests** in `tests/stickers.test.js`. Load the file with `require` and read from `globalThis.Stickers`.
  - `forName("Sabzi")` is 🥕, and so are `forName("морковь")` and `forName("carrot")`.
  - `forName("Olma")` is 🍎, and `forName("olma sharbati")` is 🧃 (longest match).
  - `forName("O‘rik")` and `forName("o'rik")` are the same emoji (🍑).
  - `forName("  SUT ")` is 🥛.
  - `forName("Noma'lum narsa", "uy")` is 🧴, and `forName("xyz")` is 🛒.
  - `Stickers.LIST.length >= 70`.
  - Every word in `LIST` maps back to its own emoji: no word appears under two emojis.
- [ ] **Step 2:** Run `node --test tests/` and expect FAIL (cannot find module).
- [ ] **Step 3: Implement `js/stickers.js`.**
  - `normalize`: lower-case, replace `‘ ’ ʻ ʼ ` with `'`, collapse whitespace, trim.
  - Matching: a word matches if it is a substring of the normalized name. Pick the longest matching word.
  - Include Uzbek, Russian and English words for at least 70 groceries, for example sabzi, kartoshka, piyoz, pomidor, bodring, karam, olma, banan, uzum, sut, qatiq, tuxum, non, guruch, go'sht, tovuq, baliq, choy, kofe, shakar, tuz, yog' and sovun.
  - The file must also work under Deno (no DOM).
- [ ] **Step 4:** Run `node --test tests/` and expect PASS.
- [ ] **Step 5:** Commit: `feat: grocery emoji stickers`.

### Task 2: Message builder

**Files:**
- Create: `js/messages.js`
- Test: `tests/messages.test.js`

**Interfaces:**
- Produces:
  - `globalThis.Messages.build(type: string, data: object, rand?: () => number) → { title, body, fixed, tag, vibrate: number[] }`
  - `data` fields: `actorRole: "er" | "xotin"`, `item?`, `task?`, `tasks?: string[]`, `meal?`, `slot?: "nonushta" | "tushlik" | "kechki"`, `hours?: number`, `memory?`
  - `fixed` is the unchanging part, used for activity rows.

- [ ] **Step 1: Write failing tests.**
  - `build("tasks_all_done", {actorRole: "xotin", tasks: ["Idishlarni yuvish", "Kirlarni yuvish"]}, () => 0)`:
    - `fixed === "Xotiningiz bugungi barcha ishlarni tugatdi: Idishlarni yuvish, Kirlarni yuvish"`
    - `body.startsWith(fixed + " — ")`
    - `title.startsWith("💐")`
  - The same call with `rand` returning 0 and then 0.99 gives different bodies, with the same `fixed`.
  - With `actorRole: "er"`, `fixed` starts with "Eringiz".
  - `build("meal_reminder", {slot: "kechki", hours: 2, meal: "Osh"})` has a body containing "Kechki ovqatga 2 soat qoldi" and "Osh". Without `meal`, the body contains "nima pishiramiz".
  - Each of the 9 types gives a title starting with its emoji from Global Constraints, and `vibrate` is a non-empty array.
  - Endings count: at least 5 per role for every type, at least 8 for `tasks_all_done`.
- [ ] **Step 2:** Run the tests and expect FAIL.
- [ ] **Step 3: Implement `js/messages.js`.**
  - Fixed copy:

    | Type | Fixed part |
    |---|---|
    | `grocery_need` | "{Role} «{item}»ni kerak deb belgiladi" |
    | `grocery_bought` | "{Role} «{item}»ni oldi ✅" |
    | `task_done` | "{Role} «{task}»ni tugatdi" |
    | `task_assigned` | "Sizga yangi ish: «{task}»" |
    | `meal_added` | "{Role} menyuga «{meal}» qo'shdi" |
    | `memory_added` | "Yangi xotira: «{memory}»" |
    | `meal_reminder` | "{Nonushta/Tushlik/Kechki ovqat}ga {hours} soat qoldi" + (" — menyuda «{meal}»" or " — hali reja yo'q, nima pishiramiz? 🤔") |

  - `meal_reminder` has no random ending.
  - `tag` = `type` (+ `slot` for reminders).
  - Vibration per type is the base pattern with the last value changed (`grocery` 260, `tasks` 400, `meal` 600, others 200).
- [ ] **Step 4:** Run the tests and expect PASS.
- [ ] **Step 5:** Commit: `feat: playful notification messages`.

### Task 3: Meal reminder timing

**Files:**
- Create: `js/reminders.js`
- Test: `tests/reminders.test.js`

**Interfaces:**
- Produces: `globalThis.Reminders.due({ now: Date, timezone: string, times: {nonushta, tushlik, kechki} /* "HH:MM" */, leadHours: number }) → Array<{ slot, mealDay: "YYYY-MM-DD", hours }>`
  - It returns each slot whose reminder time (meal time on `mealDay`, minus lead) falls in [now − 10 min, now].
  - `mealDay` is the local calendar date of the meal in `timezone`.

- [ ] **Step 1: Write failing tests**, using the `Asia/Tashkent` time zone (UTC+5).
  - Kechki 19:00, lead 2, now = 17:03 local → `[{slot:"kechki", hours:2, mealDay: today}]`.
  - Now = 17:11 local → `[]` (outside the 10-minute window).
  - Lead 0 → `[]` always.
  - Kechki "01:00", lead 3, now = 22:02 local on day D → `mealDay` = D+1.
  - With lead 1, nonushta 08:00 and now 07:00, only nonushta is returned.
- [ ] **Step 2:** Run the tests and expect FAIL.
- [ ] **Step 3: Implement** using `Intl.DateTimeFormat(…, {timeZone})` to get the local date and time parts. Check the meal day for both today and tomorrow. No dependencies.
- [ ] **Step 4:** Run the tests and expect PASS.
- [ ] **Step 5:** Commit: `feat: meal reminder timing`.

### Task 4: `Store.notify` and event wiring in pages

**Files:**
- Modify:
  - `js/store.js`: replace `log` with `notify`; add the `type`, `title`, `body` and `tag` fields to the notification insert
  - `rozgor.html`, `taomlar.html`, `uy-ishlari.html`, `xotiralar.html`: the `Store.log(` call sites
  - every page head: add the scripts `js/stickers.js`, `js/messages.js` and `js/reminders.js`
  - `js/app.js`: the notification list renders `n.title` + `n.body` when present, otherwise `n.text`
- Test: `tests/e2e/notify.spec.js` (Playwright script run with node, demo mode)

**Interfaces:**
- Consumes: `Messages.build` (Task 2).
- Produces: `Store.notify(type: string, data: object, link?: string, opts?: { toSelf?: boolean }) → Promise<void>`.
  - It writes activity `{actor_id, module, text: fixed}`.
  - It writes a notification `{recipient_id: partner (or self if toSelf), actor_id, module, type, title, body, tag, text: body, link, read: false}`.
  - `module` is derived from the type prefix (grocery, task, meal, memory).

- [ ] **Step 1: Write a failing e2e script** in demo mode. As the wife:
  1. Mark "Kartoshka" with X.
  2. Complete both of her open tasks.
  3. Un-tick one, then re-tick it.

  Then assert, by reading `Store.list("notifications")` as the husband:
  - a `grocery_need` row whose body contains "Xotiningiz «Kartoshka»ni kerak deb belgiladi — "
  - 2 `task_done` rows
  - exactly 2 `tasks_all_done` rows (one per time all were done), and none created by the un-tick
  - zero notifications addressed to the wife from her own actions
- [ ] **Step 2:** Run `node tests/e2e/notify.spec.js` and expect FAIL.
- [ ] **Step 3: Implement.**
  - Map the call sites:

    | Page | Action | Type |
    |---|---|---|
    | rozgor.html | X | `grocery_need` |
    | rozgor.html | buy | `grocery_bought` |
    | rozgor.html | add with "needed" on | `grocery_need` |
    | taomlar.html | new meal | `meal_added` |
    | taomlar.html | send ingredients | `grocery_need` with `item` = the joined ingredient names |
    | uy-ishlari.html | complete | `task_done` |
    | uy-ishlari.html | new or reassigned to partner | `task_assigned` |
    | xotiralar.html | new memory | `memory_added` |

  - After a completion in `uy-ishlari.html`, compute the actor's open tasks for today (due ≤ today or no date, `assignee_id` = me, not done). If there are none, also send `tasks_all_done` with `tasks` = the titles of the actor's tasks completed today.
  - Add the same fields to the Cloudflare and demo backends (they store whatever row they're given).
- [ ] **Step 4:** Run the e2e script and expect PASS. Also re-run the existing two-phone pairing e2e (`test-pair.js` flow) and expect no errors.
- [ ] **Step 5:** Commit: `feat: typed notifications with playful text`.

### Task 5: Colorful, playful design and stickers in the UI

**Files:**
- Modify:
  - `css/app.css`: tokens, fonts, section accents, motion
  - every page: `data-section` on `.app`, emoji headings and empty states
  - `rozgor.html`: a sticker in each row and a live preview in the editor
  - `taomlar.html`: stickers on ingredient chips
  - `index.html`: a sticker on recent-activity rows whose text names a product in «…»
  - the font `<link>` in all heads
- Test: `tests/e2e/design.spec.js`

**Interfaces:**
- Consumes: `Stickers.forName` (Task 1).
- Produces: the CSS variables `--accent` and `--accent-soft` per `[data-section]`, and `.sticker` (a 44px round emoji badge).

- [ ] **Step 1: Write a failing e2e script.**
  - On `rozgor.html`, the row for "Sabzi" contains `.sticker` with text 🥕.
  - Typing "olma" in the add sheet shows a 🍎 preview.
  - The computed style of `.tab.active .pill` background on the rozgor page equals the green accent's soft tint (assert `--accent` resolves to `#2BB673`).
  - Each of the 5 pages has `data-section` set.
  - No horizontal overflow at 375px width.
  - Save screenshots of all 5 pages.
- [ ] **Step 2:** Run the script and expect FAIL.
- [ ] **Step 3: Implement** the restyle, following the spec's Part 1 visual design.
  - Keep text contrast at AA: dark ink `#2B2440` on tints, white only on full accents.
  - Wrap all motion in `@media (prefers-reduced-motion: no-preference)`.
- [ ] **Step 4:** Run the script and expect PASS. Look at the screenshots and fix anything cramped or clashing.
- [ ] **Step 5:** Commit: `feat: colorful playful design with grocery stickers`.

### Task 6: Installable app (service worker, icons, install UI)

**Files:**
- Create:
  - `sw.js`
  - `assets/icon-192.png`, `assets/icon-512.png`, `assets/icon-maskable-512.png` (rendered from `assets/icon.svg` with Playwright screenshots)
- Modify:
  - `manifest.webmanifest`: add the PNG icons and `"id": "./"`
  - `js/app.js`: register the service worker on boot; capture `beforeinstallprompt`; add `App.installState() → "installed" | "prompt" | "ios" | "unsupported"` and `App.install()`
- Test: `tests/e2e/install.spec.js`

**Interfaces:**
- Produces:
  - `App.installState()`, `App.install()`
  - the `sw.js` events `push` and `notificationclick`, used by Task 8:
    - payload `{ title, body, tag, vibrate, url }`
    - `showNotification(title, {body, tag, vibrate, icon: "assets/icon-192.png", badge: "assets/icon-192.png", data: {url}})`

- [ ] **Step 1: Write a failing e2e script.**
  - `navigator.serviceWorker.getRegistration()` resolves to a registration after boot.
  - The manifest lists 192 and 512 PNG icons, and both return 200.
  - Dispatching a synthetic `beforeinstallprompt` makes `App.installState()` return "prompt".
  - Forcing an iPhone Safari user agent makes it return "ios".
- [ ] **Step 2:** Run the script and expect FAIL.
- [ ] **Step 3: Implement.**
  - `sw.js` caches the app shell (html, css, js, icons) cache-first, using cache name `oila-v1`.
  - The network passes through for `*.supabase.co`.
  - `push` and `notificationclick` handlers as described in Interfaces.
- [ ] **Step 4:** Run the script and expect PASS.
- [ ] **Step 5:** Commit: `feat: installable app with service worker`.

### Task 7: Settings — install, notifications, meal times

**Files:**
- Modify:
  - `js/app.js`: the `openProfile` sheet gets the new sections in the spec order
  - `js/store.js`: settings and push-subscription methods for the Supabase and demo backends; the Cloudflare backend gets stubs that throw "not supported"
- Test: `tests/e2e/settings.spec.js`

**Interfaces:**
- Consumes: `App.installState()` and `App.install()` (Task 6).
- Produces:
  - `Store.getSettings() → { breakfast, lunch, dinner, timezone, leadHours }`
  - `Store.saveFamilyTimes({breakfast, lunch, dinner, timezone})`
  - `Store.saveLeadHours(n)`
  - `Store.pushPublicKey() → string | null` (null = server not set up)
  - `Store.savePushSubscription(subJSON)`
  - `Store.deletePushSubscription(endpoint)`
  - `Store.notify("test", {}, null, {toSelf: true})` is used by "Sinab ko'rish"
  - Times are `"HH:MM"` strings. `leadHours` is 0–3.

- [ ] **Step 1: Write a failing e2e script** in demo mode.
  - Open Settings.
  - Set dinner to 20:30 and the lead to "3 soat".
  - Reload, and assert `Store.getSettings()` returns dinner "20:30", leadHours 3.
  - Assert the install row shows one of the four states.
  - With `PushManager` deleted from `window` before load, the notifications row shows "Bu brauzer bildirishnomalarni qo'llamaydi" and no page error occurs.
  - "Sinab ko'rish" creates a `test` notification addressed to self.
- [ ] **Step 2:** Run the script and expect FAIL.
- [ ] **Step 3: Implement.**
  - Supabase reads and writes `family_settings` (upsert by `household_id`) and `profiles.meal_lead_hours`.
  - `pushPublicKey` fetches `${SUPABASE_URL}/functions/v1/push?public_key` and returns null on any failure.
  - Turning notifications on runs `Notification.requestPermission()` → `reg.pushManager.subscribe({userVisibleOnly: true, applicationServerKey})` → `savePushSubscription`.
- [ ] **Step 4:** Run the script and expect PASS.
- [ ] **Step 5:** Commit: `feat: settings for install, notifications and meal times`.

### Task 8: Database and Edge Function for push

**Files:**
- Modify: `supabase/schema.sql` (append the push section)
- Create:
  - `tools/build-push.mjs`: generates the function by inlining `js/messages.js` and `js/reminders.js` into a template
  - `supabase/functions/push/template.ts`
  - `supabase/functions/push/index.ts` (generated and committed; this is the file the user pastes)
- Test:
  - `tests/sql/push.sql` (run on local PG 16 with `pg_net` and `pg_cron` stubbed)
  - `tests/push-build.test.js`
  - `tests/push-logic.test.js`

**Interfaces:**
- Consumes: `Messages.build` and `Reminders.due` (Tasks 2–3), and the `sw.js` payload shape (Task 6).
- Produces:
  - SQL:
    - tables `push_subscriptions`, `family_settings`, `push_keys` and `meal_reminders_sent`
    - column `profiles.meal_lead_hours int default 2 check (between 0 and 3)`
    - columns on `notifications`: `type`, `title`, `body`, `tag`
    - trigger `notify_push` (AFTER INSERT on notifications → `net.http_post`)
    - cron job `oila-meal-reminders` (every 5 minutes → `{"tick":true}`)
    - the function URL is `https://anmpvewqxvvwzwewnlum.supabase.co/functions/v1/push`
  - Function: `GET ?public_key → {publicKey}`; `POST {notification_id} → {sent:number}`; `POST {tick:true} → {sent:number}`.
  - Testable pure helpers exported from the template under `if (import.meta.main === false)`, or moved into a small `handlers` object the test imports via `tools/build-push.mjs --lib`:
    - `pickRecipients(notification, subscriptions) → subscriptions[]`
    - `reminderJobs({households, profiles, settings, meals, now}) → Array<{profileId, slot, mealDay, payload}>`

- [ ] **Step 1: Write failing tests.**
  - `tests/sql/push.sql`:
    - the schema re-runs cleanly
    - anon with the right family key can upsert `family_settings` and its own `push_subscriptions`; another key sees 0 rows
    - anon cannot select `push_keys` or `meal_reminders_sent`
    - inserting a notification calls the stub `net.http_post` once, with a body containing `notification_id`
    - inserting the same `(household_id, profile_id, day, slot)` twice into `meal_reminders_sent` fails
  - `tests/push-build.test.js`: running `node tools/build-push.mjs --check` exits 0 only when `index.ts` matches what the generator would produce.
  - `tests/push-logic.test.js`:
    - `pickRecipients` returns only the recipient's subscriptions, and `[]` when there are none (Review Focus 2)
    - `reminderJobs` skips profiles with lead 0 and includes the planned meal's title in the payload body
- [ ] **Step 2:** Run the SQL with `psql -v ON_ERROR_STOP=1 -f supabase/schema.sql -f tests/sql/push.sql` and `node --test tests/`. Expect FAIL.
- [ ] **Step 3: Implement.**
  - **Function** (Deno.serve):
    - Use `createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))`.
    - VAPID keys: on the first request, generate them with `webpush.generateVAPIDKeys()` and insert them into `push_keys` (id = 1).
    - Send with `webpush.sendNotification(sub, JSON.stringify(payload), {vapidDetails: {subject: "mailto:oila@example.com", publicKey, privateKey}, TTL: 3600})`.
    - Delete subscriptions on a 404 or 410 response.
    - Ticks: insert into `meal_reminders_sent` before sending; on a conflict, skip.
    - CORS headers on all responses.
  - **SQL:**
    - `create extension if not exists pg_net; create extension if not exists pg_cron;`
    - trigger function `security definer` → `net.http_post(url, body := jsonb_build_object('notification_id', new.id), headers := '{"Content-Type":"application/json"}')`
    - `cron.schedule('oila-meal-reminders', '*/5 * * * *', $$ select net.http_post(...) $$)` guarded with `unschedule` if it exists
- [ ] **Step 4:** Run both commands and expect PASS.
- [ ] **Step 5:** Commit: `feat: push notifications via Supabase Edge Function`.

### Task 9: Docs, full verification, ship

**Files:**
- Modify: `README.md` (setup: re-run the SQL, create function `push` via Editor with Verify JWT off, enable notifications on each phone, install steps)

- [ ] **Step 1:** Run every check:
  - `node --test tests/`
  - all `tests/e2e/*.spec.js`
  - the existing two-phone pairing script
  - the SQL tests

  Expect all PASS with no page errors.
- [ ] **Step 2:** Update the README setup section with the exact click-path from the spec.
- [ ] **Step 3:** Commit `docs: push and install setup`, push the branch, and fast-forward `main`.
