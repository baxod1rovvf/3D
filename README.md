# Oila Uchun — NEST

A mobile-only family website for a husband and wife: groceries, a weekly meal plan, shared memories and household tasks, synced in real time through Supabase.

## Pages (separate HTML files, linked by the bottom tab bar)

| File | Section |
|---|---|
| `index.html` | Bosh sahifa: greeting, today's overview, quick actions, recent activity |
| `rozgor.html` | Ro'zg'or: tap **X** when something runs out, then **✓** when it's bought (Kerak / Xarid qilindi / history) |
| `taomlar.html` | Taomlar menyusi: 7-day planner (nonushta / tushlik / kechki), favourites, past meals, *send ingredients to Ro'zg'or* |
| `xotiralar.html` | Oilaviy xotiralar: private photo timeline and gallery |
| `uy-ishlari.html` | Uy ishlari: today / upcoming / completed, assignee, priority, reminders |
| `kirish.html` | Sign in / sign up, then create a household or join one with an invite code |

Shared code is in `css/app.css`, `js/app.js` (shell, tab bar, sheets, notifications) and `js/store.js` (data layer).

## Run it with Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor**, paste in `supabase/schema.sql` and run it. It creates the tables, Row Level Security, the two-member household rules, realtime, and the private `memories` photo bucket.
3. Copy **Project URL** and the **anon public key** from *Project Settings → API* into `js/config.js`.
4. Serve the folder as static files (GitHub Pages, Netlify, or `python3 -m http.server`).
5. The first partner signs up and taps **Oila yaratish**. They then share the 6-character invite code from the profile sheet, and the second partner signs up and joins with it. A household is capped at two people.

### Security
- Every household table has RLS restricted to `household_id = my_household()`.
- A user can read only their own notifications and can send notifications only to their partner, never to themselves.
- Photos are stored privately under `<household_id>/…` and shown through short-lived signed URLs.

### Notifications
Every action writes an activity entry and a notification for the partner. These appear live in the in-app notification centre (bell, unread count, mark as read). If the user allows browser notifications, they also show as system notifications while the site is open in the background. True push to a closed browser would also need a service worker and a push server; that isn't included.

## Demo mode

If `js/config.js` has no keys, the app runs in **demo mode** with sample data stored in that browser only. Open two tabs, sign in as Malika in one and Jasur in the other, and changes sync between the tabs. Demo mode is for preview only; real use needs Supabase.
