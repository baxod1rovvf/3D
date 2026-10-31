// Pure helpers for the "push" Edge Function (inlined into supabase/functions/push/index.ts). Plain script, no DOM.
// Needs globalThis.Messages and globalThis.Reminders.
(function (root) {
  const DEFAULTS = { breakfast: "08:00", lunch: "13:00", dinner: "19:00", timezone: "Asia/Tashkent" };
  const FRESH_MS = 15 * 60 * 1000;

  // Subscriptions that belong to the notification's recipient (same family, same person).
  function pickRecipients(notification, subscriptions) {
    if (!notification || !notification.recipient_id) return [];
    return (subscriptions || []).filter((s) => s && s.subscription &&
      s.profile_id === notification.recipient_id && s.household_id === notification.household_id);
  }

  // Only recently created notifications are pushed, so old ids can't be replayed.
  function isFresh(notification, now) {
    const t = Date.parse(notification && notification.created_at);
    return Number.isFinite(t) && Math.abs((now || new Date()).getTime() - t) <= FRESH_MS;
  }

  function vibrateFor(type) {
    try { return root.Messages.build(type || "test", {}).vibrate; } catch (e) { return root.Messages.build("test", {}).vibrate; }
  }

  // One tag per notification, so a new push never silently replaces an earlier one.
  // Only meal reminders share a slot tag (a newer reminder for the same meal replaces the old one).
  function tagFor(n) {
    if (n.type === "meal_reminder") return n.tag || "meal_reminder";
    const base = n.type || n.module || "oila";
    return n.id ? base + "-" + n.id : base;
  }

  // notifications row -> sw.js payload {title, body, tag, vibrate, url}
  function payloadFor(n) {
    return {
      title: n.title || "Oila Uchun",
      body: n.body || n.text || "",
      tag: tagFor(n),
      vibrate: vibrateFor(n.type),
      url: n.link || "index.html",
    };
  }

  function validZone(tz) {
    if (!tz) return false;
    try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch (e) { return false; }
  }

  // Due meal reminders -> [{household_id, profile_id, day, slot, notification}]
  // (the first four are the meal_reminders_sent claim; notification is the row to insert).
  // Only people with a lead time > 0 AND at least one phone subscribed (push_subscriptions row).
  function reminderJobs({ households, profiles, settings, meals, subscriptions, now, rand }) {
    const allowed = households ? new Set(households.map((h) => (typeof h === "string" ? h : h.key))) : null;
    const subscribed = new Set((subscriptions || []).filter(Boolean).map((s) => s.household_id + "|" + s.profile_id));
    const byHouse = {};
    (settings || []).forEach((s) => { byHouse[s.household_id] = s; });
    const out = [];
    for (const p of profiles || []) {
      if (allowed && !allowed.has(p.household_id)) continue;
      const lead = Number(p.meal_lead_hours);
      if (!(lead > 0)) continue;
      if (!subscribed.has(p.household_id + "|" + p.id)) continue;
      const s = { ...DEFAULTS };
      const row = byHouse[p.household_id] || {};
      ["breakfast", "lunch", "dinner"].forEach((k) => { if (row[k]) s[k] = row[k]; });
      if (validZone(row.timezone)) s.timezone = row.timezone;
      const due = root.Reminders.due({
        now, timezone: s.timezone, leadHours: lead,
        times: { nonushta: s.breakfast, tushlik: s.lunch, kechki: s.dinner },
      });
      for (const d of due) {
        const meal = (meals || []).find((m) => m.household_id === p.household_id &&
          String(m.day_date).slice(0, 10) === d.mealDay && m.slot === d.slot);
        const m = root.Messages.build("meal_reminder", { slot: d.slot, hours: d.hours, meal: meal ? meal.title : null }, rand);
        out.push({
          household_id: p.household_id, profile_id: p.id, day: d.mealDay, slot: d.slot,
          notification: {
            household_id: p.household_id, recipient_id: p.id, actor_id: null, module: "meals", type: "meal_reminder",
            title: m.title, body: m.body, tag: m.tag, text: m.body, link: "taomlar.html", read: false,
          },
        });
      }
    }
    return out;
  }

  root.PushLogic = { pickRecipients, reminderJobs, payloadFor, isFresh };
})(globalThis);
