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

Shared code is in `css/app.css`, `js/app.js` (shell, tab bar, sheets, notifications) and `js/store.js` (data layer).

## Setup (free, one time)

The data is stored in a free [InstantDB](https://instantdb.com) app so both phones can share it.

1. Create a free account and an app at [instantdb.com/dash](https://instantdb.com/dash), then copy the **App ID**.
2. Push the database schema and access rules (`instant.schema.ts`, `instant.perms.ts`) from this folder. This needs Node.js:
   ```bash
   npm install
   ```
   ```bash
   npx instant-cli login
   ```
   ```bash
   npx instant-cli push all --app YOUR_APP_ID
   ```
3. Put the App ID into `INSTANT_APP_ID` in `js/config.js`. The App ID isn't a secret.
4. Host the folder as static files. GitHub Pages and Netlify are both free.
5. On the first phone, open the site, enter both names, and tap **Oilani boshlash**. Then tap **Havolani yuborish** to send the family link to your partner. You can share the link again later from the avatars at the top right.

## Privacy

- The family link contains a long random key: `kirish.html#k=<key>`. Every read and write sends that key, and the rules only return records whose `household_id` matches it. Without the link, nothing can be read.
- **Treat the link like a house key: share it only with your partner.** Anyone who has it can open the family's data.
- Photos are stored under `<key>/…`, and seeing or deleting one needs the key. File uploads can't carry the key, so anyone with the App ID could upload a file; they still couldn't see yours.
- The **Uzish** button in the family sheet disconnects a phone. The data stays, and the link reconnects it.

## Notifications

Every action writes an activity entry and a notification for the partner. These show live in the in-app notification centre (bell, unread count, mark as read). If allowed, they also appear as system notifications while the site is open in the background. Push to a closed browser would need a service worker and a push server; that isn't included.

## Demo mode

If `js/config.js` has no App ID, the app runs in **demo mode**: data is stored in that browser only, with sample items. Two tabs in the same browser stay in sync, so you can try it as both people. Real use between two phones needs the App ID.
