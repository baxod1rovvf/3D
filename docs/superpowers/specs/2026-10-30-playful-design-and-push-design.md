# Playful design, grocery stickers, install, and push notifications — design

Date: 2026-10-30
Status: approved in chat, awaiting written-spec review

## Goal

Oila Uchun is a two-person family site (wife and husband) on Supabase with no sign-in. This change has four parts:
- Make it colorful and playful.
- Show emoji stickers on groceries.
- Let each phone install it as an app.
- Send real push notifications, even when the app is closed, for partner activity and meal reminders.

## What the user asked for (decisions made in chat)

- Colorful, playful design with emojis.
- A fixed JS keyword → emoji map for 50+ groceries ("sabzi" → 🥕, "olma" → 🍎). **No AI.**
- "Install the app" in Settings.
- Notifications:
  - Every type has its own emoji.
  - The fixed part of the text never changes. A playful ending is picked at random each time.
  - The site has its own vibration rhythm.
- Tasks: a short push after **each** task the partner finishes, **plus** a special one when **all** of their tasks for today are done. The fixed part is "Xotiningiz bugungi barcha ishlarni tugatdi: …"; the rotating part is "— unga shokolad olib keling 🍫" and similar.
- Both directions: the husband's actions notify the wife too, with endings written for a husband.
- Meal reminders go to both partners. Meal times are approximate and **shared** by the family. Each person picks 1, 2 or 3 hours before, or off.
- Push must work when the app is closed (option B). It is delivered by a Supabase Edge Function that the user pastes in the dashboard. The user does not handle any keys.

## Assumptions (not stated by the user)

- Default meal times are 08:00, 13:00 and 19:00. The family's time zone is taken from the phone that last saved the meal times, normally Asia/Tashkent.
- "Today's tasks" are tasks assigned to that person whose due date is today or earlier, or that have no due date.
- iPhone receives push only after the app is installed to the home screen, on iOS 16.4 or later. Custom vibration works on Android only.

## Part 1 — Look, stickers, install

### Visual design (css/app.css and page styles)

- Each section has its own accent color, used for the header, its cards, buttons and the active tab pill:

  | Section | Color |
  |---|---|
  | Home | sunny yellow `#FFB703` |
  | Ro'zg'or | green `#2BB673` |
  | Taomlar | tomato `#FF6B3D` |
  | Xotiralar | pink `#FF5C8A` |
  | Uy ishlari | violet-blue `#6C63FF` |

  Pages set `data-section` on `.app`, and CSS variables `--accent` and `--accent-soft` switch per section.
- Light cream background, card radius 22px, chunky 48px+ buttons.
- Headings use **Fredoka** (Google Fonts) and body text uses **Nunito**.
- Emojis in section titles, empty states and primary buttons.
- Motion:
  - pop on X
  - confetti on task completion (already present, made colorful)
  - wobble-in for new list items
  - all of it disabled under `prefers-reduced-motion`
- Text contrast stays at WCAG AA or better: dark text on light tints, white text only on saturated accents.

### Stickers (new `js/stickers.js`)

- `Stickers.forName(name, category) → emoji`.
- A table of at least 70 entries `{ emoji, words: [...] }`, covering Uzbek Latin with apostrophe variants (`o'`, `o‘`, `oʻ`, `o`), plus Russian and English.
- Normalisation: lower-case, unify apostrophes, collapse spaces.
- Matching: every word that appears in the name counts, and the **longest** matching word wins, so "olma sharbati" → 🧃.
- Fallback by category: 🥬 sabzavot, 🍓 meva, 🧀 sut, 🍖 gosht, 🥖 non, 🧃 ichimlik, 🧴 uy, 🛒 boshqa.
- Used in:
  - Ro'zg'or rows: a 44px round sticker
  - the add/edit sheet: a live preview while typing
  - Taomlar ingredient chips
  - Home recent activity, when the activity mentions a product

### Install (Settings → "📲 Ilovani o'rnatish")

- New `sw.js` service worker at the site root, used for installability and push.
  - It has a minimal cache-first fetch handler for the app shell, so the app opens offline.
  - Data still needs the network.
- `manifest.webmanifest` gets PNG icons (192 and 512, plus a maskable one) generated from `assets/icon.svg`.
- Install behaviour:
  - **Android/Chrome:** store the `beforeinstallprompt` event, and let the button call `prompt()`.
  - **iPhone/Safari:** show a 2-step picture guide (Ulashish ⬆️ → "Bosh ekranga qo'shish").
  - **Already installed** (`display-mode: standalone`): show "✅ O'rnatilgan".

## Part 2 — Notifications

### Message builder (new `js/messages.js`, also copied into the Edge Function)

`Messages.build(type, data) → { title, body, tag, vibrate }`.

- `body` = fixed part + " — " + a random ending from that type's list. The list depends on the actor's role (`xotin` or `er`).
- Event types:
  - `grocery_need`
  - `grocery_bought`
  - `task_done`
  - `tasks_all_done`
  - `task_assigned`
  - `meal_added`
  - `memory_added`
  - `meal_reminder`
- Each type has its own title emoji: 🛒 🛍️ ✨ 💐 📋 🍽️ 📸 🍳.
- Every type has at least 5 endings. `tasks_all_done` has at least 8 per role.
- Role words: "Xotiningiz" when the actor is the wife, "Eringiz" when the actor is the husband.
- Vibration: a base signature `[120, 60, 120, 200, 120, 60, 120, 60, 260]`, with small per-type variations.

### Where events are created (client)

- The existing `Store.log(module, text, link)` becomes `Store.notify(type, data, link)`. It:
  1. builds the message
  2. inserts the activity row (fixed part only)
  3. inserts a `notifications` row for the partner with `type`, `title`, `body`, `tag` and `link`
- `tasks_all_done` is sent by the tasks page right after a completion leaves zero open tasks for today for the actor. It names those tasks.
- No notification for the actor's own actions (unchanged).

### Push delivery

- New tables, family-key RLS as before:
  - `push_subscriptions(endpoint pk, household_id, profile_id, subscription jsonb, created_at)`
  - `family_settings(household_id pk, breakfast time, lunch time, dinner time, timezone text)`
  - `profiles.meal_lead_hours int` — 0 = off, 1–3
- Server-only tables, with RLS and no policies:
  - `push_keys(id int pk, public_key, private_key)`
  - `meal_reminders_sent(household_id, profile_id, day date, slot, primary key …)`
- An `AFTER INSERT` trigger on `notifications` calls the function through `pg_net` with `{ "notification_id": … }`. The function reads the row itself with the service role, so a fake call can only re-send a real notification.
- `pg_cron` calls the function with `{ "tick": true }` every 5 minutes. For each household, profile and meal, the reminder time is the meal time minus the lead hours, in the family time zone.
  - If now is within [reminder time, reminder time + 10 minutes), the function sends the reminder.
  - It inserts into `meal_reminders_sent` first; a unique-key conflict means it was already sent.
  - The body includes the planned meal for that slot today, or "hali reja yo'q".
- **Edge Function `push`** (`supabase/functions/push/index.ts`): Deno, `npm:web-push`, "Verify JWT" off. It handles three requests:
  - `GET ?public_key`: returns the VAPID public key. On the first call it generates and stores the key pair in `push_keys`.
  - `POST {notification_id}`: pushes to every subscription of the recipient.
  - `POST {tick}`: meal reminders.
  - Subscriptions that return 404 or 410 are deleted.
- **`sw.js`:**
  - On `push`: `showNotification(title, { body, icon, badge, tag, vibrate, data: { url } })`.
  - On `notificationclick`: focus or open `url`.

### Settings → "🔔 Bildirishnomalar"

- **Yoqish (turn on):**
  1. Ask for permission.
  2. Get the public key from the function.
  3. Subscribe with `pushManager.subscribe`.
  4. Upsert into `push_subscriptions`.
- **O'chirish (turn off):** unsubscribe and delete the row.
- **"Sinab ko'rish" (test):** inserts a notification addressed to yourself with type `test`. This is the only self-notification, and the RLS policy allows it.
- Status shown in Settings: on / off / blocked (with steps to allow) / server not set up (function unreachable).

## Part 3 — Settings sheet layout

1. 📲 Ilovani o'rnatish
2. 🔔 Bildirishnomalar: switch and Sinab ko'rish
3. 🍳 Ovqat vaqtlari: three time inputs (shared), then "Qancha oldin eslatilsin?" 1 / 2 / 3 soat / O'chiq (this person)
4. 📱 Qurilmalar: Qurilmani ulash, Menda kod bor
5. Men …man, Uzish

## Errors

- Function unreachable: in-app bell and pop-ups still work, and Settings explains that the server isn't set up.
- Push permission denied: Settings shows how to allow it.
- Expired subscriptions: removed by the function.
- Meal reminders are sent once, thanks to the unique key.
- Missing meal plan: the reminder still goes out, with "nima pishiramiz?".

## Testing

- Node unit tests (`node --test`, no dependencies):
  - sticker matching for every entry, plus fallbacks
  - the message builder: fixed part present, endings vary, role words correct
  - reminder time math: lead 1, 2 and 3 hours, time zones, never twice
- SQL on local PostgreSQL 16: tables, RLS, the trigger body, idempotent re-run. `pg_cron` and `pg_net` are stubbed locally.
- Playwright with two simulated phones:
  - the new design (screenshots)
  - stickers and install UI
  - Settings save
  - notification rows created with the right type and text
- Not testable here: real push delivery and the deployed Edge Function. The user verifies these with "Sinab ko'rish".

## Out of scope

- Custom notification sounds: browsers don't allow them.
- Translating the UI.
- Per-person meal times.
