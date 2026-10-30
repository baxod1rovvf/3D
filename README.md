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
2. Open **SQL Editor → New query**, paste the whole of `supabase/schema.sql`, and press **Run**.
3. Open **Project Settings → API**. Copy the **Project URL** and the **anon public** key into `js/config.js` (`SUPABASE_URL`, `SUPABASE_ANON_KEY`).
4. Host the site folder as static files. GitHub Pages, Netlify or Cloudflare Pages are all free.
5. On the first phone, open the site, enter both names, and tap **Oilani boshlash**. A 6-digit code appears. On the partner's phone, open the site, tap **Menda kod bor**, and type it in. You can get a new code any time in **Sozlamalar → Qurilmani ulash**.

If you already ran `schema.sql` before pairing codes were added, run it again. It's safe to re-run, and it adds the pairing functions.

Changes reach the other phone right away through Supabase Realtime broadcast. Memory photos are compressed and saved in the `photos` table, so no Storage bucket is needed. The free plan's 500 MB database holds a couple of thousand photos.

Note: Supabase pauses free projects after about a week with no use. A family that opens the site every few days keeps it active, and a paused project can be restored from the dashboard.

## Privacy

- Each family has a long random secret key, which each phone keeps after setup or pairing. The site sends it with every request as the `x-family-key` header, and Row Level Security only returns rows whose `household_id` equals it. Without the key, every table looks empty.
- A pairing code hands that key to the partner's phone. Codes are single-use, expire after 10 minutes, and the site allows at most 30 wrong guesses per 10 minutes, so they can't be guessed in practice. **Only type a code on your own family's phones.**
- The **Uzish** button in Sozlamalar disconnects a phone. The data stays, and a new code reconnects it.

## Alternative: Cloudflare Worker + D1

If you'd rather not use Supabase, `cloudflare/worker.js` provides the same backend on Cloudflare's free plan:
1. Create a D1 database named `oila`.
2. Create a Worker, paste the file into it, and deploy.
3. Add a D1 binding named `DB` that points to `oila`.
4. Put the Worker address into `API_URL` in `js/config.js`, and leave the Supabase fields empty.

## Notifications

Every action writes an activity entry and a notification for the partner. These show live in the in-app notification centre (bell, unread count, mark as read). If allowed, they also appear as system notifications while the site is open in the background. Push to a closed browser would need a service worker and a push server; that isn't included.

## Demo mode

If `js/config.js` has no Supabase values, the app runs in **demo mode**: data is stored in that browser only, with sample items. Two tabs in the same browser stay in sync, so you can try it as both people. Real use between two phones needs Supabase (see Setup).
