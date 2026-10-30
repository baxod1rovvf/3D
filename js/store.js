/* Oila Uchun — data layer. No accounts: the family is identified by a secret key.
 *
 * Setup: the first phone creates the family (both names) and gets a private family link
 * (kirish.html#k=<key>). The partner opens that link once. Each phone remembers the key
 * and which of the two people it belongs to.
 *
 * Real backend: InstantDB (free). Every read and write sends the key as a rule parameter,
 * and instant.perms.ts only allows rows whose household_id equals that key.
 * Without an App ID in js/config.js, a demo backend keeps data in this browser only.
 */
(function () {
  const cfg = window.OILA_CONFIG || {};
  const TABLES = ["grocery_items", "meals", "memories", "tasks", "notifications", "activity"];

  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : "id-" + Date.now() + Math.random().toString(16).slice(2));
  const nowIso = () => new Date().toISOString();

  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = src; s.onload = res; s.onerror = () => rej(new Error("Skript yuklanmadi: " + src));
      document.head.appendChild(s);
    });
  }

  /* What this phone remembers: the family key and who is holding it. */
  const Device = {
    get(k) { try { return sessionStorage.getItem(k) || localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); localStorage.setItem(k, v); } catch (e) {} },
    del(k) { try { sessionStorage.removeItem(k); localStorage.removeItem(k); } catch (e) {} },
    key() { return this.get("oila-family-key"); },
    me() { return this.get("oila-me"); },
  };

  function sortRows(rows, opts = {}) {
    const k = opts.order || "created_at";
    rows.sort((a, b) => ((a[k] ?? "") > (b[k] ?? "") ? 1 : (a[k] ?? "") < (b[k] ?? "") ? -1 : 0) * (opts.asc ? 1 : -1));
    return opts.limit ? rows.slice(0, opts.limit) : rows;
  }

  /* ------------------------------------------------------------------ */
  /* InstantDB backend                                                   */
  /* ------------------------------------------------------------------ */
  function instantBackend() {
    let db, profile;
    const key = () => Device.key();
    const rp = () => ({ ruleParams: { key: key() } });
    const scope = (table) => (table === "notifications" ? { household_id: key(), recipient_id: profile.id } : { household_id: key() });

    async function client() {
      if (db) return db;
      if (!window.instant) await loadScript("https://cdn.jsdelivr.net/npm/@instantdb/core@1.0.67/dist/standalone/index.umd.cjs");
      db = window.instant.init({ appId: cfg.INSTANT_APP_ID });
      return db;
    }
    async function q(query, k = key()) { const c = await client(); return (await c.queryOnce(query, { ruleParams: { key: k } })).data; }
    const tx = (c, table, id, k = key()) => c.tx[table][id].ruleParams({ key: k });
    // Instant rejects undefined values; keep nulls (they clear a field).
    const clean = (o) => JSON.parse(JSON.stringify(o, (k, v) => (v === undefined ? null : v)));

    return {
      mode: "instant",
      async family(k = key()) {
        if (!k) return null;
        const data = await q({ households: { $: { where: { id: k } } }, profiles: { $: { where: { household_id: k } } } }, k);
        const household = data.households[0];
        return household ? { household, members: data.profiles } : null;
      },
      async createFamily({ familyName, wifeName, husbandName }) {
        const c = await client();
        const k = window.instant.id();
        await c.transact([
          tx(c, "households", k, k).update({ name: familyName, created_at: nowIso() }),
          tx(c, "profiles", window.instant.id(), k).update({ household_id: k, full_name: wifeName, role: "xotin", created_at: nowIso() }),
          tx(c, "profiles", window.instant.id(), k).update({ household_id: k, full_name: husbandName, role: "er", created_at: nowIso() }),
        ]);
        Device.set("oila-family-key", k);
        return k;
      },

      async list(table, opts = {}) {
        const data = await q({ [table]: { $: { where: scope(table) } } });
        return sortRows(data[table], opts);
      },
      async insert(table, row) {
        const c = await client();
        const full = clean({ created_at: nowIso(), ...row, household_id: key() });
        const id = window.instant.id();
        await c.transact(tx(c, table, id).update(full));
        return { id, ...full };
      },
      async insertMany(table, rows) {
        const c = await client();
        const out = rows.map((r) => ({ id: window.instant.id(), ...clean({ created_at: nowIso(), ...r, household_id: key() }) }));
        await c.transact(out.map(({ id, ...r }) => tx(c, table, id).update(r)));
        return out;
      },
      async update(table, id, patch) {
        const c = await client();
        const p = clean(patch);
        delete p.household_id;
        await c.transact(tx(c, table, id).update(p));
        return { id, ...p };
      },
      async updateWhere(table, match, patch) {
        const c = await client();
        const rows = (await this.list(table)).filter((r) => Object.keys(match).every((k) => r[k] === match[k]));
        if (rows.length) await c.transact(rows.map((r) => tx(c, table, r.id).update(clean(patch))));
      },
      async remove(table, id) { const c = await client(); await c.transact(tx(c, table, id).delete()); },

      subscribe(tables, cb) {
        // Instant pushes whole query results; diff ids so callers still see INSERTs.
        const unsubs = tables.map((t) => {
          let known = null;
          return db.subscribeQuery({ [t]: { $: { where: scope(t) } } }, (resp) => {
            if (resp.error || !resp.data) return;
            const rows = resp.data[t];
            if (known) {
              rows.filter((r) => !known.has(r.id)).forEach((r) => cb(t, { eventType: "INSERT", new: r }));
              cb(t, { eventType: "UPDATE", new: {} });
            }
            known = new Set(rows.map((r) => r.id));
          }, rp());
        });
        return () => unsubs.forEach((u) => u());
      },

      async uploadPhoto(blob) {
        const c = await client();
        const path = `${key()}/${window.instant.id()}.jpg`;
        await c.storage.uploadFile(path, blob, { contentType: "image/jpeg" });
        return path;
      },
      async photoUrls(paths) {
        const list = paths.filter(Boolean);
        if (!list.length) return {};
        const files = (await q({ $files: { $: { where: { path: { $in: list } } } } })).$files;
        const out = {};
        files.forEach((f) => { out[f.path] = f.url; });
        return out;
      },
      async removePhoto(path) {
        if (!path) return;
        const c = await client();
        try { await c.transact(tx(c, "$files", window.instant.lookup("path", path)).delete()); } catch (e) { console.warn(e); }
      },
      _setProfile(p) { profile = p; },
    };
  }

  /* ------------------------------------------------------------------ */
  /* Demo backend (preview only, data stays in this browser)             */
  /* ------------------------------------------------------------------ */
  function demoBackend() {
    const KEY = "oila-demo-db-v2";
    const bc = "BroadcastChannel" in window ? new BroadcastChannel("oila-demo") : null;
    const listeners = new Set();

    const HH = "demo-family";
    const WIFE = { id: "u-xotin", household_id: HH, role: "xotin" };
    const HUSB = { id: "u-er", household_id: HH, role: "er" };

    function seed(wifeName, husbName, familyName) {
      const d = (offset) => { const x = new Date(); x.setDate(x.getDate() + offset); return x.toISOString().slice(0, 10); };
      const ago = (min) => new Date(Date.now() - min * 60000).toISOString();
      const g = (name, category, status, extra = {}) => ({ id: uid(), household_id: HH, name, category, status, quantity: "", note: "", urgent: false, added_by: WIFE.id, marked_by: status !== "bor" ? WIFE.id : null, marked_at: status !== "bor" ? ago(90) : null, purchased_by: status === "olindi" ? HUSB.id : null, purchased_at: status === "olindi" ? ago(30) : null, created_at: ago(5000), ...extra });
      return {
        household: { id: HH, name: familyName },
        profiles: [{ ...WIFE, full_name: wifeName }, { ...HUSB, full_name: husbName }],
        grocery_items: [
          g("Pomidor", "sabzavot", "kerak", { quantity: "1 kg" }),
          g("Kartoshka", "sabzavot", "bor"),
          g("Piyoz", "sabzavot", "bor"),
          g("Sabzi", "sabzavot", "kerak", { quantity: "1 kg" }),
          g("Olma", "meva", "bor"),
          g("Banan", "meva", "olindi", { quantity: "6 dona" }),
          g("Sut", "sut", "kerak", { quantity: "2 litr", urgent: true, note: "1,5% yog'li" }),
          g("Qatiq", "sut", "bor"),
          g("Tuxum", "sut", "bor"),
          g("Mol go'shti", "gosht", "bor"),
          g("Tovuq", "gosht", "bor"),
          g("Non", "non", "kerak", { quantity: "2 dona", urgent: true }),
          g("Un", "non", "bor"),
          g("Choy", "ichimlik", "bor"),
          g("Mineral suv", "ichimlik", "olindi"),
          g("Idish yuvish vositasi", "uy", "kerak"),
          g("Guruch", "boshqa", "bor"),
        ],
        meals: [
          { id: uid(), household_id: HH, day_date: d(0), slot: "nonushta", title: "Qaymoq va non", description: "", ingredients: [], notes: "", favorite: false, created_by: WIFE.id, created_at: ago(600) },
          { id: uid(), household_id: HH, day_date: d(0), slot: "kechki", title: "Tovuq sho'rva", description: "Yengil, issiq sho'rva", ingredients: ["Tovuq", "Kartoshka", "Sabzi", "Piyoz"], notes: "Tovuqni 1 soat qaynatish", favorite: true, created_by: WIFE.id, created_at: ago(300) },
          { id: uid(), household_id: HH, day_date: d(1), slot: "tushlik", title: "Osh", description: "Juma oshi", ingredients: ["Guruch", "Mol go'shti", "Sabzi", "Piyoz", "Yog'"], notes: "", favorite: true, created_by: HUSB.id, created_at: ago(200) },
          { id: uid(), household_id: HH, day_date: d(-3), slot: "kechki", title: "Manti", description: "", ingredients: ["Un", "Mol go'shti", "Piyoz"], notes: "", favorite: false, created_by: WIFE.id, created_at: ago(5000) },
        ],
        memories: [
          { id: uid(), household_id: HH, title: "Birinchi uchrashuvimiz", description: "Bahor kuni, Bobur bog'ida. Kun bo'yi gaplashib, vaqt qanday o'tganini sezmay qoldik.", memory_date: "2021-04-17", photo_path: null, created_by: HUSB.id, created_at: ago(9000) },
          { id: uid(), household_id: HH, title: "Birinchi sayohatimiz", description: "Samarqand — Registon tunda yana ham chiroyli edi.", memory_date: "2022-09-03", photo_path: null, created_by: WIFE.id, created_at: ago(8000) },
        ],
        tasks: [
          { id: uid(), household_id: HH, title: "Idishlarni yuvish", description: "", assignee_id: HUSB.id, due_date: d(0), priority: "orta", done: false, completed_by: null, completed_at: null, remind_at: null, reminded: false, created_by: WIFE.id, created_at: ago(400) },
          { id: uid(), household_id: HH, title: "Kirlarni yuvish", description: "Oq va rangli alohida", assignee_id: WIFE.id, due_date: d(0), priority: "past", done: false, completed_by: null, completed_at: null, remind_at: null, reminded: false, created_by: WIFE.id, created_at: ago(380) },
          { id: uid(), household_id: HH, title: "Chiqindilarni tashlash", description: "", assignee_id: HUSB.id, due_date: d(0), priority: "yuqori", done: true, completed_by: HUSB.id, completed_at: ago(45), remind_at: null, reminded: false, created_by: WIFE.id, created_at: ago(500) },
          { id: uid(), household_id: HH, title: "Uyni tozalash", description: "Shanba kuni umumiy tozalash", assignee_id: WIFE.id, due_date: d(2), priority: "orta", done: false, completed_by: null, completed_at: null, remind_at: new Date(Date.now() + 86400000 * 2).toISOString(), reminded: false, created_by: HUSB.id, created_at: ago(300) },
          { id: uid(), household_id: HH, title: "Bozorlik qilish", description: "", assignee_id: HUSB.id, due_date: d(1), priority: "yuqori", done: false, completed_by: null, completed_at: null, remind_at: null, reminded: false, created_by: WIFE.id, created_at: ago(200) },
        ],
        notifications: [
          { id: uid(), household_id: HH, recipient_id: HUSB.id, actor_id: WIFE.id, module: "grocery", text: `${wifeName} ro'zg'orga «Sut»ni qo'shdi`, link: "rozgor.html", read: false, created_at: ago(90) },
          { id: uid(), household_id: HH, recipient_id: WIFE.id, actor_id: HUSB.id, module: "tasks", text: `${husbName} «Chiqindilarni tashlash» ishini bajardi`, link: "uy-ishlari.html", read: false, created_at: ago(45) },
        ],
        activity: [
          { id: uid(), household_id: HH, actor_id: WIFE.id, module: "grocery", text: `${wifeName} ro'zg'orga «Sut»ni qo'shdi`, created_at: ago(90) },
          { id: uid(), household_id: HH, actor_id: HUSB.id, module: "tasks", text: `${husbName} «Chiqindilarni tashlash» ishini bajardi`, created_at: ago(45) },
          { id: uid(), household_id: HH, actor_id: HUSB.id, module: "grocery", text: `${husbName} «Banan»ni xarid qildi`, created_at: ago(30) },
        ],
      };    }

    const read = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } };
    function write(data) {
      try { localStorage.setItem(KEY, JSON.stringify(data)); }
      catch (e) { throw new Error("Demo xotira to'ldi. Kichikroq rasm tanlang."); }
    }
    const emit = (table, payload) => {
      listeners.forEach((l) => l(table, payload));
      if (bc) bc.postMessage({ table, payload: JSON.parse(JSON.stringify(payload)) });
    };
    if (bc) bc.onmessage = (m) => listeners.forEach((l) => l(m.data.table || "*", m.data.payload || {}));
    window.addEventListener("storage", (e) => { if (e.key === KEY) listeners.forEach((l) => l("*", {})); });

    return {
      mode: "demo",
      async family(k = Device.key()) {
        const data = read();
        if (!data || k !== HH) return null;
        return { household: data.household, members: data.profiles };
      },
      async createFamily({ familyName, wifeName, husbandName }) {
        write(seed(wifeName, husbandName, familyName));
        Device.set("oila-family-key", HH);
        return HH;
      },

      async list(table, opts = {}) {
        let rows = read()[table].slice();
        if (table === "notifications") rows = rows.filter((r) => r.recipient_id === Device.me());
        return sortRows(rows, opts);
      },
      async insert(table, row) {
        const data = read();
        const full = { id: uid(), household_id: HH, created_at: nowIso(), ...row };
        data[table].push(full); write(data); emit(table, { eventType: "INSERT", new: full });
        return full;
      },
      async insertMany(table, rows) { const out = []; for (const r of rows) out.push(await this.insert(table, r)); return out; },
      async update(table, id, patch) {
        const data = read();
        const r = data[table].find((x) => x.id === id);
        if (!r) throw new Error("Topilmadi");
        Object.assign(r, patch); write(data); emit(table, { eventType: "UPDATE", new: r });
        return r;
      },
      async updateWhere(table, match, patch) {
        const data = read();
        data[table].forEach((r) => { if (Object.keys(match).every((k) => r[k] === match[k])) Object.assign(r, patch); });
        write(data); emit(table, { eventType: "UPDATE", new: {} });
      },
      async remove(table, id) {
        const data = read();
        data[table] = data[table].filter((x) => x.id !== id); write(data); emit(table, { eventType: "DELETE", old: { id } });
      },
      subscribe(tables, cb) {
        const l = (t, p) => { if (t === "*" || tables.includes(t)) cb(t, p); };
        listeners.add(l);
        return () => listeners.delete(l);
      },
      async uploadPhoto(blob) {
        return await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob); });
      },
      async photoUrls(paths) { const o = {}; paths.filter(Boolean).forEach((p) => (o[p] = p)); return o; },
      async removePhoto() {},
      _setProfile() {},
    };
  }

  const backend = cfg.INSTANT_APP_ID ? instantBackend() : demoBackend();

  /* ------------------------------------------------------------------ */
  /* Shared helpers on top of the backend                                */
  /* ------------------------------------------------------------------ */
  const Store = Object.assign(backend, {
    TABLES,
    ctx: null,
    Device,

    /** Who is using this phone, inside the family on this phone. Null until both are known. */
    async session() {
      const fam = await backend.family();
      if (!fam) return null;
      const profile = fam.members.find((m) => m.id === Device.me()) || null;
      if (!profile) return { household: fam.household, members: fam.members, profile: null, partner: null };
      const partner = fam.members.find((m) => m.id !== profile.id) || null;
      backend._setProfile(profile);
      return { household: fam.household, members: fam.members, profile, partner };
    },
    /** Save the family key from a family link; resolves to the family or null if the key is unknown. */
    async joinFamily(k) {
      const fam = await backend.family(k);
      if (fam) Device.set("oila-family-key", k);
      return fam;
    },
    chooseMe(id) { Device.set("oila-me", id); },
    /** Private link the partner opens once to connect their phone. */
    familyLink() {
      const base = location.href.replace(/[#?].*$/, "").replace(/[^/]*$/, "");
      return `${base}kirish.html#k=${Device.key()}`;
    },
    /** Disconnect this phone (the family's data stays). */
    forgetDevice() { Device.del("oila-family-key"); Device.del("oila-me"); },

    /** Record an activity and notify the partner (never the actor). */
    async log(module, text, link) {
      const c = Store.ctx;
      if (!c) return;
      const jobs = [Store.insert("activity", { actor_id: c.profile.id, module, text })];
      if (c.partner) jobs.push(Store.insert("notifications", { recipient_id: c.partner.id, actor_id: c.profile.id, module, text, link: link || null, read: false }));
      try { await Promise.all(jobs); } catch (e) { console.warn("log failed", e); }
    },

    /** Resize an image file to a JPEG blob (keeps uploads small and fast). */
    async compressImage(file, max = 1400, quality = 0.82) {
      const url = URL.createObjectURL(file);
      try {
        const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const cv = document.createElement("canvas");
        cv.width = Math.round(img.width * scale); cv.height = Math.round(img.height * scale);
        cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
        return await new Promise((res) => cv.toBlob(res, "image/jpeg", quality));
      } finally { URL.revokeObjectURL(url); }
    },
  });

  window.Store = Store;
})();
