/* Oila Uchun — data layer.
 * Supabase is the real backend (auth, Postgres + RLS, realtime, storage).
 * When js/config.js has no keys, a local demo backend with the same API is used
 * so the app can be previewed; two tabs sync via BroadcastChannel to imitate both partners.
 */
(function () {
  const cfg = window.OILA_CONFIG || {};
  const HAS_SUPABASE = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);
  const TABLES = ["grocery_items", "meals", "memories", "tasks", "notifications", "activity"];

  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : "id-" + Date.now() + Math.random().toString(16).slice(2));
  const nowIso = () => new Date().toISOString();

  /* ------------------------------------------------------------------ */
  /* Supabase backend                                                    */
  /* ------------------------------------------------------------------ */
  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = src; s.onload = res; s.onerror = () => rej(new Error("Skript yuklanmadi: " + src));
      document.head.appendChild(s);
    });
  }

  function supabaseBackend() {
    let sb, session, profile, partner, household;

    async function client() {
      if (sb) return sb;
      if (!window.supabase) await loadScript("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js");
      sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
      return sb;
    }
    const check = ({ data, error }) => { if (error) throw error; return data; };

    return {
      mode: "supabase",
      async session() {
        const c = await client();
        session = check(await c.auth.getSession()).session;
        if (!session) return null;
        profile = check(await c.from("profiles").select("*").eq("id", session.user.id).maybeSingle());
        if (!profile || !profile.household_id) return { user: session.user, profile, partner: null, household: null };
        household = check(await c.from("households").select("*").eq("id", profile.household_id).single());
        const members = check(await c.from("profiles").select("*").eq("household_id", profile.household_id));
        partner = members.find((m) => m.id !== profile.id) || null;
        return { user: session.user, profile, partner, household };
      },
      async signIn(email, password) { const c = await client(); check(await c.auth.signInWithPassword({ email, password })); },
      async signUp(email, password, full_name, role) {
        const c = await client();
        const data = check(await c.auth.signUp({ email, password, options: { data: { full_name, role } } }));
        return { needsConfirm: !data.session };
      },
      async signOut() { const c = await client(); await c.auth.signOut(); },
      async createHousehold(name) { const c = await client(); return check(await c.rpc("create_household", { p_name: name })); },
      async joinHousehold(code) { const c = await client(); return check(await c.rpc("join_household", { p_code: code.trim().toUpperCase() })); },

      async list(table, opts = {}) {
        const c = await client();
        let q = c.from(table).select("*").eq("household_id", profile.household_id);
        if (table === "notifications") q = q.eq("recipient_id", profile.id);
        q = q.order(opts.order || "created_at", { ascending: !!opts.asc });
        if (opts.limit) q = q.limit(opts.limit);
        return check(await q);
      },
      async insert(table, row) {
        const c = await client();
        return check(await c.from(table).insert({ household_id: profile.household_id, ...row }).select().single());
      },
      async insertMany(table, rows) {
        const c = await client();
        return check(await c.from(table).insert(rows.map((r) => ({ household_id: profile.household_id, ...r }))).select());
      },
      async update(table, id, patch) {
        const c = await client();
        return check(await c.from(table).update(patch).eq("id", id).select().single());
      },
      async updateWhere(table, match, patch) {
        const c = await client();
        let q = c.from(table).update(patch).eq("household_id", profile.household_id);
        for (const k in match) q = q.eq(k, match[k]);
        check(await q);
      },
      async remove(table, id) { const c = await client(); check(await c.from(table).delete().eq("id", id)); },

      subscribe(tables, cb) {
        const ch = sb.channel("household-" + profile.household_id + "-" + uid());
        tables.forEach((t) => {
          const filter = t === "notifications" ? `recipient_id=eq.${profile.id}` : `household_id=eq.${profile.household_id}`;
          ch.on("postgres_changes", { event: "*", schema: "public", table: t, filter }, (p) => cb(t, p));
        });
        ch.subscribe();
        return () => sb.removeChannel(ch);
      },

      async uploadPhoto(blob) {
        const c = await client();
        const path = `${profile.household_id}/${uid()}.jpg`;
        check(await c.storage.from(cfg.PHOTO_BUCKET).upload(path, blob, { contentType: "image/jpeg", upsert: false }));
        return path;
      },
      async photoUrls(paths) {
        const c = await client();
        const list = paths.filter(Boolean);
        if (!list.length) return {};
        const data = check(await c.storage.from(cfg.PHOTO_BUCKET).createSignedUrls(list, 60 * 60));
        const out = {};
        data.forEach((d) => { if (d.signedUrl) out[d.path] = d.signedUrl; });
        return out;
      },
      async removePhoto(path) { if (!path) return; const c = await client(); await c.storage.from(cfg.PHOTO_BUCKET).remove([path]); },
    };
  }

  /* ------------------------------------------------------------------ */
  /* Demo backend (preview only)                                         */
  /* ------------------------------------------------------------------ */
  function demoBackend() {
    const KEY = "oila-demo-db-v1";
    const ME = "oila-demo-me";
    const bc = "BroadcastChannel" in window ? new BroadcastChannel("oila-demo") : null;
    const listeners = new Set();

    const HH = "hh-demo";
    const WIFE = { id: "u-xotin", household_id: HH, full_name: "Malika", role: "xotin" };
    const HUSB = { id: "u-er", household_id: HH, full_name: "Jasur", role: "er" };

    function seed() {
      const d = (offset) => { const x = new Date(); x.setDate(x.getDate() + offset); return x.toISOString().slice(0, 10); };
      const ago = (min) => new Date(Date.now() - min * 60000).toISOString();
      const g = (name, category, status, extra = {}) => ({ id: uid(), household_id: HH, name, category, status, quantity: "", note: "", urgent: false, added_by: WIFE.id, marked_by: status !== "bor" ? WIFE.id : null, marked_at: status !== "bor" ? ago(90) : null, purchased_by: status === "olindi" ? HUSB.id : null, purchased_at: status === "olindi" ? ago(30) : null, created_at: ago(5000), ...extra });
      return {
        household: { id: HH, name: "Bizning uy", invite_code: "NEST24" },
        profiles: [WIFE, HUSB],
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
          { id: uid(), household_id: HH, recipient_id: HUSB.id, actor_id: WIFE.id, module: "grocery", text: "Malika ro'zg'orga «Sut»ni qo'shdi", link: "rozgor.html", read: false, created_at: ago(90) },
          { id: uid(), household_id: HH, recipient_id: WIFE.id, actor_id: HUSB.id, module: "tasks", text: "Jasur «Chiqindilarni tashlash» ishini bajardi", link: "uy-ishlari.html", read: false, created_at: ago(45) },
        ],
        activity: [
          { id: uid(), household_id: HH, actor_id: WIFE.id, module: "grocery", text: "Malika ro'zg'orga «Sut»ni qo'shdi", created_at: ago(90) },
          { id: uid(), household_id: HH, actor_id: HUSB.id, module: "tasks", text: "Jasur «Chiqindilarni tashlash» ishini bajardi", created_at: ago(45) },
          { id: uid(), household_id: HH, actor_id: HUSB.id, module: "grocery", text: "Jasur «Banan»ni xarid qildi", created_at: ago(30) },
        ],
      };
    }

    const read = () => { try { const v = JSON.parse(localStorage.getItem(KEY)); if (v) return v; } catch (e) {} const s = seed(); write(s); return s; };
    function write(db) {
      try { localStorage.setItem(KEY, JSON.stringify(db)); }
      catch (e) { throw new Error("Demo xotira to'ldi. Kichikroq rasm tanlang."); }
    }
    const emit = (table, payload) => {
      listeners.forEach((l) => l(table, payload));
      if (bc) bc.postMessage({ table, payload: JSON.parse(JSON.stringify(payload)) });
    };
    if (bc) bc.onmessage = (m) => listeners.forEach((l) => l(m.data.table || "*", m.data.payload || {}));
    window.addEventListener("storage", (e) => { if (e.key === KEY) listeners.forEach((l) => l("*", {})); });

    // Each tab may act as a different partner (sessionStorage), defaulting to the last choice.
    const meId = () => { try { return sessionStorage.getItem(ME) || localStorage.getItem(ME); } catch (e) { return null; } };
    const setMe = (id) => { try { sessionStorage.setItem(ME, id); localStorage.setItem(ME, id); } catch (e) {} };
    const me = () => read().profiles.find((p) => p.id === meId());

    return {
      mode: "demo",
      async session() {
        const p = me();
        if (!p) return null;
        const db = read();
        return { user: { id: p.id, email: p.role + "@demo" }, profile: p, partner: db.profiles.find((x) => x.id !== p.id), household: db.household };
      },
      async signIn(role) { setMe(role === "er" ? HUSB.id : WIFE.id); },
      async signUp() { throw new Error("Demo rejimda ro'yxatdan o'tish yo'q"); },
      async signOut() { try { sessionStorage.removeItem(ME); localStorage.removeItem(ME); } catch (e) {} },
      switchUser() { setMe(meId() === HUSB.id ? WIFE.id : HUSB.id); },
      reset() { localStorage.removeItem(KEY); },
      async createHousehold() {}, async joinHousehold() {},

      async list(table, opts = {}) {
        let rows = read()[table].slice();
        if (table === "notifications") rows = rows.filter((r) => r.recipient_id === meId());
        const k = opts.order || "created_at";
        rows.sort((a, b) => (a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0) * (opts.asc ? 1 : -1));
        return opts.limit ? rows.slice(0, opts.limit) : rows;
      },
      async insert(table, row) {
        const db = read();
        const full = { id: uid(), household_id: HH, created_at: nowIso(), ...row };
        db[table].push(full); write(db); emit(table, { eventType: "INSERT", new: full });
        return full;
      },
      async insertMany(table, rows) { const out = []; for (const r of rows) out.push(await this.insert(table, r)); return out; },
      async update(table, id, patch) {
        const db = read();
        const r = db[table].find((x) => x.id === id);
        if (!r) throw new Error("Topilmadi");
        Object.assign(r, patch); write(db); emit(table, { eventType: "UPDATE", new: r });
        return r;
      },
      async updateWhere(table, match, patch) {
        const db = read();
        db[table].forEach((r) => { if (Object.keys(match).every((k) => r[k] === match[k])) Object.assign(r, patch); });
        write(db); emit(table, { eventType: "UPDATE", new: {} });
      },
      async remove(table, id) {
        const db = read();
        db[table] = db[table].filter((x) => x.id !== id); write(db); emit(table, { eventType: "DELETE", old: { id } });
      },
      subscribe(tables, cb) {
        const l = (t, p) => { if (t === "*" || tables.includes(t)) cb(t, p); };
        listeners.add(l);
        return () => listeners.delete(l);
      },
      async uploadPhoto(blob) {
        const dataUrl = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob); });
        return dataUrl;
      },
      async photoUrls(paths) { const o = {}; paths.filter(Boolean).forEach((p) => (o[p] = p)); return o; },
      async removePhoto() {},
    };
  }

  const backend = HAS_SUPABASE ? supabaseBackend() : demoBackend();

  /* ------------------------------------------------------------------ */
  /* Shared helpers on top of the backend                                */
  /* ------------------------------------------------------------------ */
  const Store = Object.assign(backend, {
    TABLES,
    ctx: null,

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
