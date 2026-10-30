# Oila Uchun — NEST

A mobile-only family website for a husband and wife: groceries, a weekly meal plan, shared memories and household tasks. Both phones stay in sync live.

There is **no sign-in**. The site is for one family only:
1. The first phone sets up the family by entering both names.
2. On that phone, **Sozlamalar (⚙) → Qurilmani ulash** shows a 6-digit code.
3. On the partner's phone, tap **Menda kod bor** (on the welcome screen, or in Sozlamalar) and type the code.
4. Each phone asks once "whose phone is this?" and remembers the answer. From then on both phones share the same data.

A code works once and expires after 10 minutes. If it expires, tap **Yangi kod olish** for a new one.

## Pages (separate HTML files, linked by the bottom tab bar)

| File | Section |
|---|---|
| `index.html` | Bosh sahifa: greeting, today's overview, quick actions, recent activity |
| `rozgor.html` | Ro'zg'or: tap **X** when something runs out, then **✓** when it's bought (Kerak / Xarid qilindi / history) |
| `taomlar.html` | Taomlar menyusi: 7-day planner (nonushta / tushlik / kechki), favourites, past meals, *send ingredients to Ro'zg'or* |
| `xotiralar.html` | Oilaviy xotiralar: private photo timeline and gallery |
| `uy-ishlari.html` | Uy ishlari: today / upcoming / completed, assignee, priority, reminders |
| `kirish.html` | First-time setup, entering a pairing code, and "whose phone is this?" |

Shared code is in `css/app.css`, `js/app.js` (shell, tab bar, sheets, notifications) and `js/store.js` (data layer). The database setup is `supabase/schema.sql`.

## Setup with Supabase (free, one time)

1. In [supabase.com](https://supabase.com), create a new project. The free plan is enough.
2. Open **Project Settings → API**. Copy the **Project URL** and the **anon public** key into `js/config.js` (`SUPABASE_URL`, `SUPABASE_ANON_KEY`).
3. Host the site folder as static files (GitHub Pages, Netlify or Cloudflare Pages are all free).

### 1. Run the SQL (also after every update)

Open **SQL Editor → New query**, paste the whole of `supabase/schema.sql`, and press **Run**. It is safe to re-run. It adds the notification columns, the settings tables, pairing, the push trigger and the 5-minute meal timer. Supabase may ask to enable the `pg_net` and `pg_cron` extensions. The SQL enables them itself. If it says they are unavailable, enable them in **Database → Extensions** and run it again.

### 2. Deploy the push function

1. Open **Edge Functions → Deploy a new function → Via Editor**.
2. Name it `push` and paste the whole of `supabase/functions/push/index.ts`.
3. Turn **OFF** "Verify JWT" (Enforce JWT verification), then press **Deploy**.
4. Check: opening `https://<your-project>.supabase.co/functions/v1/push?public_key` in a browser shows `{"publicKey":"..."}`.

### 3. On each phone

1. Install the app: **⚙ Sozlamalar → 📲 Ilovani o'rnatish**. On iPhone use Share → **Bosh ekranga qo'shish**, then open the app from the home-screen icon. Push on iPhone needs iOS 16.4 or newer.
2. Open **⚙ → 🔔 Bildirishnomalar**, turn it on, and press **Sinab ko'rish** to get a test notification.

### 4. Meal times

In **⚙ → 🍳 Ovqat vaqtlari** set breakfast, lunch and dinner times (shared by the family). Each person picks **Qancha oldin eslatilsin?** (0–3 hours before) for their own phone.

### 5. Pair the phones

On the first phone, open the site, enter both names, and tap **Oilani boshlash**. A 6-digit code appears. On the partner's phone, tap **Menda kod bor** and type it in. You can get a new code any time in **Sozlamalar → Qurilmani ulash**.

Changes reach the other phone right away through Supabase Realtime broadcast. Memory photos are compressed and saved in the `photos` table, so no Storage bucket is needed. The free plan's 500 MB database holds a couple of thousand photos.

Note: Supabase pauses free projects after about a week with no use. A family that opens the site every few days keeps it active, and a paused project can be restored from the dashboard.

## Privacy

- Each family has a long random secret key, which each phone keeps after setup or pairing. The site sends it with every request as the `x-family-key` header, and Row Level Security only returns rows whose `household_id` equals it. Without the key, every table looks empty.
- A pairing code hands that key to the partner's phone. Codes are single-use, expire after 10 minutes, and the site allows at most 30 wrong guesses per 10 minutes, so they can't be guessed in practice. **Only type a code on your own family's phones.**
- The **Uzish** button in Sozlamalar disconnects a phone. The data stays, and a new code reconnects it.

## Alternative: Cloudflare Worker + D1

If you'd rather not use Supabase, `cloudflare/worker.js` provides the same backend on Cloudflare's free plan, **without phone push notifications** (the in-app notification centre still works):
1. Create a D1 database named `oila`.
2. Create a Worker, paste the file into it, and deploy.
3. Add a D1 binding named `DB` that points to `oila`.
4. Put the Worker address into `API_URL` in `js/config.js`, and leave the Supabase fields empty.

## Features and notifications

- Playful design with emoji stickers on grocery items, and an installable app (PWA).
- Every action writes an activity entry and a notification for the partner, in both directions (husband to wife and wife to husband), with a playful message and a hint such as "bring it on your way home". They show in the in-app bell (unread count, mark as read) and, with Supabase push set up, as phone notifications even when the site is closed.

| Emoji | When |
|---|---|
| 🛒 | Something ran out (Ro'zg'or) |
| 🛍️ | Something was bought |
| ✨ | A household task was done |
| 💐 | All of today's tasks are done |
| 📋 | A task was assigned to you |
| 🍽️ | A meal was added to the menu |
| 📸 | A memory was added |
| 🍳 | Meal reminder (time per meal, 0–3 hours before) |

Custom vibration patterns work on Android only. iPhone ignores them.

The function creates its own push keys on first use and keeps them in `push_keys`, which the site can't read. To change it, edit `supabase/functions/push/template.ts` or `js/messages.js`, `js/reminders.js`, `js/push-logic.js`, then run `node tools/build-push.mjs` and paste the regenerated `index.ts` again.

## Running the tests

```
node --test tests/*.test.js          # unit tests
node tools/build-push.mjs --check    # index.ts is up to date
bash tests/sql/run.sh                # SQL tests (needs a local PostgreSQL 16 on port 5499, socket /tmp/oila-pgtest)
python3 -m http.server 8765 &        # then run each tests/e2e/*.spec.js with node
```

The e2e specs use Playwright and read the path of `lucide.min.js` from the `LUCIDE_PATH` env var.

## Demo mode

If `js/config.js` has no Supabase values, the app runs in **demo mode**: data is stored in that browser only, with sample items. Two tabs in the same browser stay in sync, so you can try it as both people. Real use between two phones needs Supabase (see Setup).
