// "Bugun nima pishiramiz?" — which meals haven't been made for the longest time.
// Plain script: attaches Suggest to globalThis (browser and Node tests).
(function (root) {
  const norm = (s) => (root.Stickers && root.Stickers.normalize
    ? root.Stickers.normalize(s)
    : String(s || "").toLowerCase().replace(/[‘’ʻʼ`´]/g, "'").replace(/\s+/g, " ").trim());
  const DAY = 86400000;
  const toUtc = (ymd) => Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10));
  const addDays = (ymd, n) => new Date(toUtc(ymd) + n * DAY).toISOString().slice(0, 10);

  /**
   * Candidates are saved recipes plus every title ever planned in the menu (merged by name).
   * "Made" means planned on a day up to today. Anything planned today or tomorrow is left out.
   * Order: never made first, then the oldest last-made; ties put recipes first, then by title.
   */
  function meals({ recipes = [], meals: planned = [], today }) {
    const tomorrow = addDays(today, 1);
    const byKey = new Map();
    const entry = (title) => {
      const k = norm(title);
      if (!k) return null;
      if (!byKey.has(k)) byKey.set(k, { title, recipe: null, lastMade: null, soon: false });
      return byKey.get(k);
    };
    recipes.forEach((r) => { const e = entry(r.title); if (e) { e.recipe = r; e.title = r.title; } });
    planned.forEach((m) => {
      const e = entry(m.title);
      if (!e || !m.day_date) return;
      if (m.day_date === today || m.day_date === tomorrow) e.soon = true;
      else if (m.day_date < today && (!e.lastMade || m.day_date > e.lastMade)) e.lastMade = m.day_date;
    });
    return [...byKey.values()]
      .filter((e) => !e.soon)
      .map((e) => ({ title: e.title, recipe: e.recipe, lastMade: e.lastMade, daysAgo: e.lastMade ? Math.round((toUtc(today) - toUtc(e.lastMade)) / DAY) : null }))
      .sort((a, b) =>
        (a.lastMade === null ? 0 : 1) - (b.lastMade === null ? 0 : 1) ||
        (a.lastMade || "").localeCompare(b.lastMade || "") ||
        (a.recipe ? 0 : 1) - (b.recipe ? 0 : 1) ||
        a.title.localeCompare(b.title));
  }

  root.Suggest = { meals };
})(globalThis);
