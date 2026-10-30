// Meal reminder timing: which slots are due now. Plain script, no DOM.
(function (root) {
  const SLOTS = ["nonushta", "tushlik", "kechki"];
  const WINDOW_MS = 10 * 60 * 1000;
  const HOUR_MS = 60 * 60 * 1000;
  const DAY_MS = 24 * HOUR_MS;

  // Local wall-clock parts of an instant in a time zone
  function localParts(date, timezone) {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone, hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    const p = {};
    fmt.formatToParts(date).forEach((x) => { p[x.type] = x.value; });
    return {
      year: +p.year, month: +p.month, day: +p.day,
      hour: +p.hour % 24, minute: +p.minute, second: +p.second,
    };
  }

  // Reminders whose time (meal time minus lead) is in [now - 10 min, now].
  // All maths is on local wall-clock values expressed as UTC milliseconds.
  function due(opts) {
    const { now, timezone, times, leadHours } = opts;
    const lead = Number(leadHours) || 0;
    if (lead <= 0) return [];
    const n = localParts(now, timezone);
    const nowWall = Date.UTC(n.year, n.month - 1, n.day, n.hour, n.minute, n.second);
    const out = [];
    for (const dayOffset of [0, 1]) {
      const dayStart = Date.UTC(n.year, n.month - 1, n.day) + dayOffset * DAY_MS;
      const mealDay = new Date(dayStart).toISOString().slice(0, 10);
      for (const slot of SLOTS) {
        const m = /^(\d{1,2}):(\d{2})$/.exec((times && times[slot]) || "");
        if (!m) continue;
        const mealWall = dayStart + (+m[1]) * HOUR_MS + (+m[2]) * 60000;
        const remindWall = mealWall - lead * HOUR_MS;
        if (remindWall <= nowWall && remindWall > nowWall - WINDOW_MS) {
          out.push({ slot, mealDay, hours: lead });
        }
      }
    }
    return out;
  }

  root.Reminders = { due, localParts, SLOTS };
})(globalThis);
