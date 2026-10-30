# Oila Uchun — NEST

A mobile-only family website for a husband and wife: groceries, a weekly meal plan, shared memories and household tasks. Both phones stay in sync live.

There is **no sign-in**. The site is for one family only:
1. The first phone sets up the family by entering both names.
2. That phone sends the private **family link** to the partner.
3. The partner opens the link once.
4. Each phone asks once "whose phone is this?" and remembers the answer.

## Pages (separate HTML files, linked by the bottom tab bar)

| File | Section |
|---|---|
| `index.html` | Bosh sahifa: greeting, today's overview, quick actions, recent activity |
| `rozgor.html` | Ro'zg'or: tap **X** when something runs out, then **✓** when it's bought (Kerak / Xarid qilindi / history) |
| `taomlar.html` | Taomlar menyusi: 7-day planner (nonushta / tushlik / kechki), favourites, past meals, *send ingredients to Ro'zg'or* |
| `xotiralar.html` | Oilaviy xotiralar: private photo timeline and gallery |
| `uy-ishlari.html` | Uy ishlari: today / upcoming / completed, assignee, priority, reminders |
| `kirish.html` | First-time setup, the family link, and "whose phone is this?" |

Shared code is in `css/app.css`, `js/app.js` (shell, tab bar, sheets, notifications) and `js/store.js` (data layer). The server code is `cloudflare/worker.js`.

## Setup (free, one time, all in the browser)

The data lives in a free **Cloudflare D1** database, reached through a small Cloudflare **Worker** (`cloudflare/worker.js`). The Worker creates its tables by itself, so there's no SQL to run.

1. Sign up for free at [dash.cloudflare.com](https://dash.cloudflare.com/sign-up).
2. **Create the database:** go to *Storage & Databases → D1 SQL Database → Create*, name it `oila`, and create it.
3. **Create the Worker:** go to *Compute (Workers) → Workers & Pages → Create → Start with Hello World*, name it `oila-uchun`, and click **Deploy**.
4. Click **Edit code**, delete everything, paste the whole of `cloudflare/worker.js`, and click **Deploy**.
5. **Connect the database:** open the Worker's *Bindings* tab (or *Settings → Bindings*), click **Add binding → D1 database**, set the variable name to `DB`, choose `oila`, and save.
6. Copy the Worker's address (like `https://oila-uchun.yourname.workers.dev`) into `API_URL` in `js/config.js`. Opening that address in a browser should show `{"ok":true,"app":"Oila Uchun"}`.
7. Host the site folder as static files. GitHub Pages, Netlify or Cloudflare Pages are all free.
8. On the first phone, open the site, enter both names, and tap **Oilani boshlash**. Then tap **Havolani yuborish** to send the family link to your partner. You can share the link again later from the avatars at the top right.

The free plan's daily limits (about 100,000 Worker requests and 100,000 database writes) are far more than one family uses. Changes reach the other phone within about 4 seconds.

## Privacy

- The family link contains a long random key: `kirish.html#k=<key>`. The Worker refuses any request without a matching key and only ever reads or writes that family's rows and photos. Without the link, nothing can be read.
- **Treat the link like a house key: share it only with your partner.** Anyone who has it can open the family's data.
- The **Uzish** button in the family sheet disconnects a phone. The data stays, and the link reconnects it.

## Notifications

Every action writes an activity entry and a notification for the partner. These show live in the in-app notification centre (bell, unread count, mark as read). If allowed, they also appear as system notifications while the site is open in the background. Push to a closed browser would need a service worker and a push server; that isn't included.

## Demo mode

If `js/config.js` has no `API_URL`, the app runs in **demo mode**: data is stored in that browser only, with sample items. Two tabs in the same browser stay in sync, so you can try it as both people. Real use between two phones needs the Worker (see Setup).
