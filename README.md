# Oila Uchun — NEST

A mobile-only family website for a husband and wife: groceries, a weekly meal plan, shared memories and household tasks, synced in real time through a free [InstantDB](https://instantdb.com) app (Supabase also supported).

## Pages (separate HTML files, linked by the bottom tab bar)

| File | Section |
|---|---|
| `index.html` | Bosh sahifa: greeting, today's overview, quick actions, recent activity |
| `rozgor.html` | Ro'zg'or: tap **X** when something runs out, then **✓** when it's bought (Kerak / Xarid qilindi / history) |
| `taomlar.html` | Taomlar menyusi: 7-day planner (nonushta / tushlik / kechki), favourites, past meals, *send ingredients to Ro'zg'or* |
| `xotiralar.html` | Oilaviy xotiralar: private photo timeline and gallery |
| `uy-ishlari.html` | Uy ishlari: today / upcoming / completed, assignee, priority, reminders |
| `kirish.html` | Sign in (email code with InstantDB), then create a household or join one with an invite code |

Shared code is in `css/app.css`, `js/app.js` (shell, tab bar, sheets, notifications) and `js/store.js` (data layer).

## Run it with InstantDB (free, recommended)

InstantDB's free plan includes sign-in, the database, live sync and file storage. Its pricing page says free apps aren't paused and there's no limit on the number of apps; check the current limits at [instantdb.com/pricing](https://instantdb.com/pricing).

1. Create a free account and a new app at [instantdb.com/dash](https://instantdb.com/dash), then copy the **App ID**.
2. Push the database schema and access rules (`instant.schema.ts`, `instant.perms.ts`). This needs Node.js and is done once, from this folder:
   ```bash
   npm install
   ```
   ```bash
   npx instant-cli login
   ```
   ```bash
   npx instant-cli push all --app YOUR_APP_ID
   ```
3. Put the App ID into `INSTANT_APP_ID` in `js/config.js`.
4. Serve the folder as static files. GitHub Pages and Netlify are both free.
5. The first partner enters their email, types the 6-digit code from the email, enters a name, and taps **Oila yaratish**. They share the invite code shown in the profile sheet, and the second partner signs in the same way and joins with that code. A household is capped at two people.

Access rules (`instant.perms.ts`):
- Every record has a `household_id`, and only users linked to that household can read or change it.
- Anyone else, and anything not listed in the rules, is denied, and clients can't create new fields.
- Joining needs the invite code and is refused once the household has two members.
- A user reads only their own notifications and can notify only their partner.
- Photos are stored under `<household_id>/…` and are visible only to that household.

## Run it with Supabase (alternative)

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor**, paste in `supabase/schema.sql` and run it. It creates the tables, Row Level Security, the two-member household rules, realtime, and the private `memories` photo bucket.
3. Copy **Project URL** and the **anon public key** from *Project Settings → API* into `js/config.js`, and leave `INSTANT_APP_ID` empty.
4. Serve the folder as static files (GitHub Pages, Netlify, or `python3 -m http.server`).
5. The first partner signs up and taps **Oila yaratish**. They then share the 6-character invite code from the profile sheet, and the second partner signs up and joins with it. A household is capped at two people.

Supabase security:
- Every household table has RLS restricted to `household_id = my_household()`.
- A user can read only their own notifications and can send notifications only to their partner, never to themselves.
- Photos are stored privately under `<household_id>/…` and shown through short-lived signed URLs.

### Notifications
Every action writes an activity entry and a notification for the partner. These appear live in the in-app notification centre (bell, unread count, mark as read). If the user allows browser notifications, they also show as system notifications while the site is open in the background. True push to a closed browser would also need a service worker and a push server; that isn't included.

## Demo mode

If `js/config.js` has no App ID or keys, the app runs in **demo mode** with sample data stored in that browser only. Open two tabs, sign in as Malika in one and Jasur in the other, and changes sync between the tabs. Demo mode is for preview only; real use needs InstantDB or Supabase.
