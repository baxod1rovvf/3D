/* Oila Uchun — shared shell: auth guard, top bar, bottom tabs, sheets, toasts, notifications. */
(function () {
  const TABS = [
    { href: "index.html", id: "home", section: "home", icon: "house", label: "Bosh sahifa" },
    { href: "rozgor.html", id: "rozgor", section: "rozgor", icon: "shopping-basket", label: "Ro'zg'or" },
    { href: "taomlar.html", id: "taomlar", section: "taomlar", icon: "utensils", label: "Taomlar" },
    { href: "xotiralar.html", id: "xotiralar", section: "xotiralar", icon: "heart", label: "Xotiralar" },
    { href: "uy-ishlari.html", id: "uy", section: "uy-ishlari", icon: "sparkles", label: "Uy ishlari" },
  ];
  const MODULE_ICON = { grocery: "shopping-basket", meals: "utensils", memories: "heart", tasks: "sparkles" };

  const MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
  const WEEKDAYS = ["Yakshanba", "Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba"];
  const WEEKDAYS_SHORT = ["Ya", "Du", "Se", "Ch", "Pa", "Ju", "Sh"];

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function icons() { if (window.lucide) window.lucide.createIcons({ attrs: { "stroke-width": 1.8 } }); }

  /* ---------- dates ---------- */
  const pad = (n) => String(n).padStart(2, "0");
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseYmd = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const today = () => ymd(new Date());
  const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
  const fmtLong = (d) => `${WEEKDAYS[d.getDay()]}, ${d.getDate()}-${MONTHS[d.getMonth()]}`;
  const fmtDate = (s) => { if (!s) return ""; const d = parseYmd(s.slice(0, 10)); return `${d.getDate()}-${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };
  const fmtShort = (s) => {
    if (!s) return "";
    const t = today();
    if (s === t) return "Bugun";
    if (s === addDays(t, 1)) return "Ertaga";
    if (s === addDays(t, -1)) return "Kecha";
    const d = parseYmd(s);
    return `${d.getDate()}-${MONTHS[d.getMonth()]}`;
  };
  function timeAgo(iso) {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return "hozirgina";
    if (diff < 3600) return `${Math.floor(diff / 60)} daqiqa oldin`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} soat oldin`;
    if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} kun oldin`;
    return fmtDate(iso);
  }
  function greeting() {
    const h = new Date().getHours();
    if (h < 5) return "Xayrli tun";
    if (h < 11) return "Xayrli tong";
    if (h < 18) return "Xayrli kun";
    return "Xayrli kech";
  }

  /* ---------- people ---------- */
  function person(id) {
    const c = Store.ctx;
    if (!c || !id) return null;
    if (c.profile && c.profile.id === id) return c.profile;
    if (c.partner && c.partner.id === id) return c.partner;
    return null;
  }
  const firstName = (p) => (p && p.full_name ? p.full_name.split(" ")[0] : "Kimdir");
  const nameOf = (id) => firstName(person(id));
  const isMe = (id) => Store.ctx && Store.ctx.profile.id === id;
  function avatar(p, cls = "") {
    if (!p) return "";
    const initial = esc((p.full_name || "?").trim().charAt(0).toUpperCase());
    return `<span class="avatar ${p.role === "er" ? "him" : "her"} ${cls}" title="${esc(p.full_name)}">${initial}</span>`;
  }

  /* ---------- toast ---------- */
  function toast(text, icon = "check", action) {
    let wrap = $(".toast-wrap");
    if (!wrap) { wrap = document.createElement("div"); wrap.className = "toast-wrap"; wrap.setAttribute("role", "status"); wrap.setAttribute("aria-live", "polite"); $(".app").appendChild(wrap); }
    const t = document.createElement("div");
    t.className = "toast";
    t.innerHTML = `<i data-lucide="${icon}"></i><span>${esc(text)}</span>`;
    const hide = () => { if (t.classList.contains("out")) return; t.classList.add("out"); setTimeout(() => t.remove(), 220); };
    if (action) {
      // An action toast (e.g. "Bekor qilish"): stays longer and takes taps.
      const b = document.createElement("button");
      b.className = "toast-action"; b.type = "button"; b.textContent = action.label;
      b.addEventListener("click", () => { hide(); action.onClick(); });
      t.appendChild(b);
    }
    wrap.appendChild(t); icons();
    setTimeout(hide, action ? action.ms || 5000 : 2600);
    return hide;
  }
  /** "Done — Bekor qilish": runs undo() if tapped within 5 seconds. */
  function undoToast(text, undo, icon = "check") {
    return toast(text, icon, { label: "Bekor qilish", ms: 5000, onClick: undo });
  }
  function fail(e) {
    console.error(e);
    toast("Saqlab bo'lmadi. Internetni tekshirib, qayta urinib ko'ring.", "wifi-off");
  }

  /* ---------- bottom sheet ---------- */
  function sheet({ title, body, foot, onMount, onClose }) {
    const app = $(".app");
    const lastFocus = document.activeElement;
    const back = document.createElement("div");
    back.className = "sheet-backdrop";
    const el = document.createElement("div");
    el.className = "sheet"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-label", title);
    el.innerHTML = `<div class="grabber"></div>
      <div class="sheet-head"><h3>${esc(title)}</h3><button class="icon-btn" data-close aria-label="Yopish"><i data-lucide="x"></i></button></div>
      <div class="sheet-body">${body}</div>${foot ? `<div class="sheet-foot">${foot}</div>` : ""}`;
    app.append(back, el); icons();
    requestAnimationFrame(() => { back.classList.add("open"); el.classList.add("open"); });
    const api = {
      el,
      close() {
        back.classList.remove("open"); el.classList.remove("open");
        document.removeEventListener("keydown", onKey);
        setTimeout(() => { back.remove(); el.remove(); }, 280);
        if (lastFocus && lastFocus.focus) lastFocus.focus();
        onClose && onClose();
      },
    };
    function onKey(e) {
      if (e.key === "Escape") api.close();
      if (e.key === "Tab") {
        const f = $$("button, input, select, textarea, a[href]", el).filter((x) => !x.disabled && x.offsetParent);
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    }
    document.addEventListener("keydown", onKey);
    back.addEventListener("click", api.close);
    $$("[data-close]", el).forEach((b) => b.addEventListener("click", api.close));
    onMount && onMount(el, api);
    setTimeout(() => { const first = $("[autofocus]", el); if (first) first.focus(); }, 300);
    return api;
  }

  function confirmSheet(text, verb = "O'chirish") {
    return new Promise((resolve) => {
      let ok = false;
      sheet({
        title: "Ishonchingiz komilmi?",
        body: `<p style="margin:4px 0 8px;color:var(--ink-2)">${esc(text)}</p>`,
        foot: `<button class="btn ghost" data-close>Bekor qilish</button><button class="btn danger" data-ok>${esc(verb)}</button>`,
        onMount(el, api) { $("[data-ok]", el).addEventListener("click", () => { ok = true; api.close(); }); },
        onClose() { resolve(ok); },
      });
    });
  }

  /* ---------- notifications ---------- */
  let notifCache = [];
  async function refreshBell() {
    try { notifCache = await Store.list("notifications", { limit: 60 }); } catch (e) { return; }
    const n = notifCache.filter((x) => !x.read).length;
    const dot = $("#bell .dot");
    if (dot) { dot.textContent = n > 9 ? "9+" : n; dot.hidden = n === 0; }
    const bell = $("#bell");
    if (bell) bell.setAttribute("aria-label", n ? `Bildirishnomalar, ${n} ta o'qilmagan` : "Bildirishnomalar");
  }
  function notifHtml() {
    if (!notifCache.length) return `<div class="empty"><div class="ico"><i data-lucide="bell"></i></div><strong>Hozircha bildirishnoma yo'q</strong><p>Juftingiz biror narsa qo'shsa yoki bajarsa, shu yerda ko'rinadi.</p></div>`;
    return notifCache.map((n) => `<a class="notif ${n.read ? "" : "unread"}" href="${esc(n.link || "#")}" data-id="${n.id}">
        <span class="n-ico"><i data-lucide="${MODULE_ICON[n.module] || "bell"}"></i></span>
        <span class="n-text">${n.title ? `<b style="display:block;font-size:12px">${esc(n.title)}</b>${esc(n.body || n.text)}` : esc(n.text)}<div class="n-time">${timeAgo(n.created_at)}</div></span></a>`).join("");
  }
  function openNotifications() {
    const hasUnread = notifCache.some((n) => !n.read);
    const pushAvail = "Notification" in window && Notification.permission === "default";
    sheet({
      title: "Bildirishnomalar",
      body: `${pushAvail ? `<button class="btn ghost block" data-push style="margin-bottom:10px"><i data-lucide="bell-ring"></i>Brauzer bildirishnomalarini yoqish</button>` : ""}<div data-list>${notifHtml()}</div>`,
      foot: hasUnread ? `<button class="btn ghost" data-readall><i data-lucide="check-check"></i>Hammasini o'qilgan qilish</button>` : "",
      onMount(el, api) {
        const readAll = $("[data-readall]", el);
        if (readAll) readAll.addEventListener("click", async () => {
          try { await Store.updateWhere("notifications", { recipient_id: Store.ctx.profile.id, read: false }, { read: true }); } catch (e) { return fail(e); }
          await refreshBell(); $("[data-list]", el).innerHTML = notifHtml(); icons(); readAll.remove();
        });
        const push = $("[data-push]", el);
        if (push) push.addEventListener("click", async () => { const r = await Notification.requestPermission(); push.remove(); if (r === "granted") toast("Bildirishnomalar yoqildi", "bell-ring"); });
        $("[data-list]", el).addEventListener("click", async (e) => {
          const a = e.target.closest(".notif"); if (!a) return;
          e.preventDefault();
          try { await Store.update("notifications", a.dataset.id, { read: true }); } catch (err) {}
          const href = a.getAttribute("href");
          if (href && href !== "#" && !location.pathname.endsWith(href)) { api.close(); go(href); }
          else { await refreshBell(); api.close(); }
        });
      },
    });
  }
  function browserPush(n) {
    if (!("Notification" in window) || Notification.permission !== "granted" || !document.hidden) return;
    try { new Notification("Oila Uchun", { body: n.text, icon: "assets/icon.svg", tag: n.id }); } catch (e) {}
  }

  /* ---------- shell rendering ---------- */
  function topbar({ title, sub, home, emoji }) {
    const c = Store.ctx;
    const people = [c.profile, c.partner].filter(Boolean).map((p) => avatar(p)).join("");
    if (home) {
      return `<header class="topbar">
        <a href="index.html" class="logo" aria-label="Oila Uchun — bosh sahifa">${logoSvg()}</a>
        <span style="flex:1"></span>
        <button class="icon-btn" id="bell" aria-label="Bildirishnomalar"><i data-lucide="bell"></i><span class="dot" hidden></span></button>
        <button class="icon-btn" id="settings-btn" aria-label="Sozlamalar"><i data-lucide="settings"></i></button>
        <button class="avatars" id="me-btn" aria-label="Sozlamalar" style="border:0;background:none;padding:0">${people}</button>
      </header>`;
    }
    return `<header class="topbar">
      <h1>${esc(title)}${emoji ? ` <span class="emo" aria-hidden="true">${esc(emoji)}</span>` : ""}${sub ? `<span class="sub">${esc(sub)}</span>` : ""}</h1>
      <button class="icon-btn" id="bell" aria-label="Bildirishnomalar"><i data-lucide="bell"></i><span class="dot" hidden></span></button>
        <button class="icon-btn" id="settings-btn" aria-label="Sozlamalar"><i data-lucide="settings"></i></button>
      <button class="avatars" id="me-btn" aria-label="Sozlamalar" style="border:0;background:none;padding:0">${people}</button>
    </header>`;
  }
  function logoSvg() {
    return `<span style="display:flex;align-items:center;gap:9px">
      ${logoMark(38)}
      <span style="line-height:1.05"><span class="logo-word">NEST</span><br><span class="logo-sub">Oila Uchun</span></span></span>`;
  }
  /** The playful app mark: a sunny tile with two smiling faces under one roof. */
  function logoMark(size) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="20" fill="#FFB703"/>
        <path d="M12 30 32 13l20 17" fill="none" stroke="#2B2440" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="24" cy="38" r="9" fill="#FF5C8A"/><circle cx="41" cy="37" r="10" fill="#6C63FF"/>
        <path d="M20.5 40.5c2 2 5 2 7 0M37 40c2.4 2.4 5.6 2.4 8 0" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/></svg>`;
  }
  function tabbar(active) {
    return `<nav class="tabbar" aria-label="Asosiy bo'limlar">${TABS.map((t) => `
      <a class="tab ${t.id === active ? "active" : ""}" data-section="${t.section}" href="${t.href}" ${t.id === active ? 'aria-current="page"' : ""}>
        <span class="pill"><i data-lucide="${t.icon}"></i></span><span>${t.label}</span></a>`).join("")}</nav>`;
  }

  /* ---------- device pairing ---------- */
  /** HTML for a code box; the caller fills it with Store.createPairCode(). */
  const codeDigits = (code) => `<div class="pair-code" aria-label="Ulash kodi ${esc(code.split("").join(" "))}">${code.split("").map((d) => `<span>${esc(d)}</span>`).join("")}</div>`;

  /** Explain a pairing failure: missing server setup, unknown family, too many tries, or the network. */
  function pairError(e, prefix) {
    const m = `${(e && e.code) || ""} ${(e && e.message) || e || ""}`;
    if (/too_many/.test(m)) return "Juda ko'p urinish bo'ldi. 10 daqiqadan so'ng qayta urinib ko'ring.";
    if (/PGRST202|could not find the function|pair_code/i.test(m)) return `${prefix} Serverda ulash funksiyasi yo'q: Supabase → SQL Editor'da supabase/pairing.sql ni ishga tushiring.`;
    if (/family_not_found/.test(m)) return `${prefix} Bu telefonning oilasi serverda topilmadi. Sozlamalar → Uzish, so'ng oilani qaytadan boshlang.`;
    if (/fetch|network|Failed to/i.test(m)) return `${prefix} Internetni tekshirib, qayta urinib ko'ring.`;
    return `${prefix} Server xatosi: ${String((e && e.message) || e).slice(0, 120)}`;
  }

  /** "Qurilmani ulash": show a 6-digit code the partner types on their phone. */
  async function showPairCode(target) {
    const render = async (box) => {
      box.innerHTML = `<div class="skeleton" style="height:64px;margin:6px 0"></div>`;
      let code;
      try { code = await Store.createPairCode(); }
      catch (e) { console.error(e); box.innerHTML = `<p class="error-text">${esc(pairError(e, "Kod olinmadi."))}</p>`; return; }
      box.innerHTML = `${codeDigits(code)}
        <p class="hint" style="text-align:center;margin:10px 0 0">Juftingiz o'z telefonida <b>«Menda kod bor»</b>ni bosib, shu kodni kiritadi. Kod 10 daqiqa va faqat bir marta ishlaydi.</p>
        <button class="link-btn" data-new style="display:block;margin:8px auto 0">Yangi kod olish</button>`;
      $("[data-new]", box).addEventListener("click", () => render(box));
    };
    if (target) return render(target);
    sheet({
      title: "Qurilmani ulash",
      body: `<div data-box></div>`,
      foot: `<button class="btn primary" data-close>Tayyor</button>`,
      onMount(el) { render($("[data-box]", el)); },
    });
  }

  /** "Menda kod bor": type the partner's code; this phone joins their family. */
  function enterPairCode({ inline, onJoined } = {}) {
    const html = `<form data-pair novalidate>
        <div class="field"><label for="pair-in">Juftingiz telefonidagi kod</label>
          <input class="input pair-input" id="pair-in" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]*" autofocus>
          <span class="hint">Juftingiz telefonida: Sozlamalar → «Qurilmani ulash».</span></div>
        <p class="error-text" data-err hidden></p>
        <button class="btn primary block" type="submit">Ulash</button>
      </form>`;
    const wire = (root, done) => {
      const f = $("[data-pair]", root), err = $("[data-err]", root), inp = $("#pair-in", root);
      inp.addEventListener("input", () => { inp.value = inp.value.replace(/\D/g, "").slice(0, 6); err.hidden = true; });
      f.addEventListener("submit", async (e) => {
        e.preventDefault();
        const code = inp.value.trim();
        if (code.length !== 6) { err.textContent = "Kod 6 ta raqamdan iborat."; err.hidden = false; return; }
        const btn = f.querySelector("button[type=submit]"); btn.disabled = true;
        try {
          const k = await Store.claimPairCode(code);
          // Drop the old family's server row while its key is still active. The browser stays subscribed:
          // the next page boot files the same subscription under the new family.
          if (k) await withTimeout(dropServerPushQuietly());
          if (!k || !(await Store.joinFamily(k))) { err.textContent = "Kod noto'g'ri yoki eskirgan. Juftingizdan yangi kod so'rang."; err.hidden = false; btn.disabled = false; return; }
          Store.Device.del("oila-me");
          done && done(); onJoined ? onJoined() : (location.href = "kirish.html");
        } catch (ex) {
          console.error(ex);
          err.textContent = pairError(ex, "Ulanib bo'lmadi.");
          err.hidden = false; btn.disabled = false;
        }
      });
      setTimeout(() => inp.focus(), 300);
    };
    if (inline) { inline.innerHTML = html; wire(inline); return; }
    sheet({ title: "Menda kod bor", body: html, onMount(el, api) { wire(el, () => api.close()); } });
  }

  function installRow() {
    const st = installState();
    const row = (ico, title, meta, extra = "") => `<div class="row"><i data-lucide="${ico}"></i><div class="grow"><div class="title">${title}</div><div class="meta">${meta}</div></div>${extra}</div>`;
    if (st === "installed") return row("circle-check", "\u2705 O'rnatilgan", "Ilova telefoningizda ishlayapti");
    if (st === "prompt") return row("download", "Telefonga o'rnatish", "Bosh ekranda alohida ilova bo'ladi", `<button class="btn primary" data-install>O'rnatish</button>`);
    if (st === "ios") return row("share", "Bosh ekranga qo'shing", "1) Pastdagi Ulashish \u2B06\uFE0F tugmasini bosing. 2) \u00ABBosh ekranga qo'shish\u00BB ni tanlang. 3) Ilovani bosh ekrandan oching \u2014 uning xotirasi alohida, shuning uchun ichida \u00ABMenda kod bor\u00BB orqali qayta ulang (yoki oilani o'sha yerda boshlang).");
    return row("info", "O'rnatish", "Brauzer menyusidan \u00ABIlovani o'rnatish\u00BB yoki \u00ABBosh ekranga qo'shish\u00BB ni tanlang.");
  }

  const urlB64ToBytes = (b64) => {
    const pad = "=".repeat((4 - (b64.length % 4)) % 4);
    const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(raw, (c) => c.charCodeAt(0));
  };
  const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

  /** Resolves with the promise result, or undefined after ms (never hangs the caller). */
  const withTimeout = (promise, ms = 3000) => Promise.race([promise, new Promise((res) => setTimeout(res, ms))]);
  /** The service worker registration, or an error if it is not ready in time (e.g. registration failed). */
  async function swReady(ms = 4000) {
    const reg = await withTimeout(navigator.serviceWorker.ready, ms);
    if (!reg) throw new Error("Service worker tayyor emas");
    return reg;
  }

  /** { state: "unsupported"|"ios"|"blocked"|"noserver"|"on"|"off", key } for this phone. */
  async function pushStatus() {
    // iPhone Safari only gets PushManager inside the installed (home-screen) app.
    if (!pushSupported()) return { state: installState() === "ios" ? "ios" : "unsupported" };
    let key = null;
    try { key = await Store.pushPublicKey(); } catch (e) {}
    if (!key) return { state: "noserver" };
    if (Notification.permission === "denied") return { state: "blocked" };
    let reg;
    try { reg = await swReady(); } catch (e) { return { state: "unsupported" }; }
    let sub = null;
    try { sub = await reg.pushManager.getSubscription(); } catch (e) {}
    return { state: sub && Notification.permission === "granted" ? "on" : "off", key };
  }
  const PUSH_TEXT = {
    on: "Yoqilgan: bu telefonga xabarlar keladi.",
    off: "O'chiq. Yoqsangiz, ilova yopiq bo'lsa ham xabar keladi.",
    blocked: "Bloklangan. Telefon sozlamalaridan shu sayt uchun bildirishnomalarga ruxsat bering.",
    noserver: "Server hali sozlanmagan. Bildirishnomalar keyinroq yoqiladi.",
    unsupported: "Bu brauzer bildirishnomalarni qo'llamaydi",
    ios: "Avval ilovani bosh ekranga o'rnating, keyin shu yerdan yoqing.",
  };

  async function enablePush(key) {
    if ((await Notification.requestPermission()) !== "granted") return false;
    const reg = await swReady();
    const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToBytes(key) }));
    try { await Store.savePushSubscription(sub.toJSON()); }
    catch (e) { try { await sub.unsubscribe(); } catch (e2) {} throw e; }
    return true;
  }
  /** Non-fatal: point this browser's existing push subscription at another person (after "Men ...man"). */
  async function rebindPush(profile) {
    try {
      if (!pushSupported()) return;
      const sub = await (await swReady()).pushManager.getSubscription();
      if (!sub) return;
      Store._setProfile(profile);
      await Store.savePushSubscription(sub.toJSON());
    } catch (e) { console.warn("push rebind", e); }
  }
  async function disablePush() {
    const sub = await (await swReady()).pushManager.getSubscription();
    if (!sub) return;
    const endpoint = sub.endpoint;
    await sub.unsubscribe();
    try { await Store.deletePushSubscription(endpoint); } catch (e) { console.warn(e); }
  }
  const disablePushQuietly = async () => { try { if (pushSupported()) await disablePush(); } catch (e) { console.warn("push off", e); } };
  /** Pairing: remove only the server row of the current family; keep the browser subscription. */
  const dropServerPushQuietly = async () => {
    try {
      if (!pushSupported()) return;
      const sub = await (await swReady()).pushManager.getSubscription();
      if (sub) await Store.deletePushSubscription(sub.endpoint);
    } catch (e) { console.warn("push drop", e); }
  };
  /**
   * Boot: file this browser's existing subscription under the current family and person, once per
   * page session (e.g. after pairing into another family). Bounded and non-fatal.
   */
  async function resyncPush(ctx) {
    try {
      if (Store.mode !== "supabase" || !pushSupported() || Notification.permission !== "granted") return;
      const flag = "oila-push-synced", val = Store.Device.key() + "|" + ctx.profile.id;
      try { if (sessionStorage.getItem(flag) === val) return; } catch (e) {}
      const sub = await (await swReady()).pushManager.getSubscription();
      if (!sub) return;
      await withTimeout(Store.savePushSubscription(sub.toJSON()), 5000);
      try { sessionStorage.setItem(flag, val); } catch (e) {}
    } catch (e) { console.warn("push resync", e); }
  }

  function openProfile() {
    const quiet = quietPrefs();
    const c = Store.ctx;
    const demo = Store.mode === "demo";
    const leads = [[1, "1 soat"], [2, "2 soat"], [3, "3 soat"], [0, "O'chiq"]];
    sheet({
      title: "Sozlamalar",
      body: `<div class="card list">
          <div class="row">${avatar(c.profile)}<div class="grow"><div class="title">${esc(c.profile.full_name)} <span class="chip">Siz</span></div><div class="meta">${c.profile.role === "er" ? "Er" : "Xotin"}</div></div></div>
          ${c.partner ? `<div class="row">${avatar(c.partner)}<div class="grow"><div class="title">${esc(c.partner.full_name)}</div><div class="meta">${c.partner.role === "er" ? "Er" : "Xotin"}</div></div></div>` : ""}
        </div>
        <div class="section"><div class="section-head"><h2>\uD83D\uDCF2 Ilovani o'rnatish</h2></div>
          <div class="card list" data-install-row>${installRow()}</div></div>
        <div class="section"><div class="section-head"><h2>\uD83D\uDD14 Bildirishnomalar</h2></div>
          <div class="card" data-push-row style="padding:14px">
            <label class="switch"><span class="title">Shu telefonga xabar yuborish</span><input type="checkbox" data-push-switch disabled></label>
            <p class="hint" data-push-status style="margin:6px 0 12px">Tekshirilmoqda\u2026</p>
            <button class="btn" data-push-test><i data-lucide="send"></i>Sinab ko'rish</button>
          </div></div>
        <div class="section"><div class="section-head"><h2>\uD83C\uDF73 Ovqat vaqtlari</h2></div>
          <div class="card" style="padding:14px">
            <div class="field"><label for="set-breakfast">Nonushta</label><input class="input" id="set-breakfast" type="time" data-set-breakfast value="08:00"></div>
            <div class="field"><label for="set-lunch">Tushlik</label><input class="input" id="set-lunch" type="time" data-set-lunch value="13:00"></div>
            <div class="field"><label for="set-dinner">Kechki ovqat</label><input class="input" id="set-dinner" type="time" data-set-dinner value="19:00"></div>
            <p class="hint" style="margin:-6px 0 14px">Bu vaqtlar butun oila uchun umumiy.</p>
            <div class="field" style="margin-bottom:0"><span class="label" id="lead-label">Qancha oldin eslatilsin?</span>
              <div class="choice" data-lead role="radiogroup" aria-labelledby="lead-label">${leads.map(([n, t]) => `<label><input type="radio" name="lead" value="${n}"${n === 2 ? " checked" : ""}><span>${t}</span></label>`).join("")}</div>
            </div>
          </div></div>
        <div class="section"><div class="section-head"><h2>🌙 Tinch soatlar</h2></div>
          <div class="card" style="padding:14px">
            <label class="switch"><span class="title">Kechasi ovozsiz</span><input type="checkbox" data-quiet-on${quiet.on ? " checked" : ""}></label>
            <div class="field-row" style="margin-top:10px">
              <div class="field" style="margin-bottom:0"><label for="quiet-from">Boshlanishi</label><input class="input" id="quiet-from" type="time" data-quiet-from value="${quiet.from}"></div>
              <div class="field" style="margin-bottom:0"><label for="quiet-to">Tugashi</label><input class="input" id="quiet-to" type="time" data-quiet-to value="${quiet.to}"></div>
            </div>
            <p class="hint" style="margin:10px 0 0">Bu vaqtda xabarlar keladi, lekin telefon jiringlamaydi va titramaydi. Faqat shu telefon uchun.</p>
          </div></div>
        <div class="section"><div class="section-head"><h2>🎨 Ko'rinish</h2></div>
          <div class="card" style="padding:14px">
            <div class="choice" data-theme-choice role="radiogroup" aria-label="Ko'rinish">${[["auto", "📱 Avto"], ["light", "☀️ Yorug'"], ["dark", "🌙 Qorong'i"]].map(([v, t]) => `<label><input type="radio" name="theme" value="${v}"${theme() === v ? " checked" : ""}><span>${t}</span></label>`).join("")}</div>
            <p class="hint" style="margin:10px 0 0">«Avto» telefon sozlamasiga qarab o'zgaradi.</p>
          </div></div>
        <div class="section"><div class="section-head"><h2>\uD83D\uDCF1 Qurilmalar</h2></div>
          <div class="card list">
            <button class="row" data-pair-show style="width:100%;border:0;background:none;text-align:left"><i data-lucide="smartphone"></i><div class="grow"><div class="title">Qurilmani ulash</div><div class="meta">Juftingiz telefoni uchun kod olish</div></div><i data-lucide="chevron-right"></i></button>
            <button class="row" data-pair-enter style="width:100%;border:0;background:none;text-align:left"><i data-lucide="keyboard"></i><div class="grow"><div class="title">Menda kod bor</div><div class="meta">Juftingiz bergan kodni kiritish</div></div><i data-lucide="chevron-right"></i></button>
          </div></div>
        ${demo ? `<p class="hint" style="margin-top:14px">Demo rejim: ma'lumotlar faqat shu brauzerda. Ikki telefon o'rtasida ulashish uchun js/config.js ga Supabase manzili va kalitini yozing.</p>` : ""}`,
      foot: `${c.partner ? `<button class="btn ghost" data-switch><i data-lucide="repeat"></i>Men ${esc(firstName(c.partner))}man</button>` : ""}<button class="btn danger" data-out><i data-lucide="unplug"></i>Uzish</button>`,
      onMount(el, api) {
        const inst = $("[data-install]", el);
        if (inst) inst.addEventListener("click", async () => {
          await install();
          $("[data-install-row]", el).innerHTML = installRow(); icons();
        });

        // Notifications for this phone.
        const pushSw = $("[data-push-switch]", el), status = $("[data-push-status]", el);
        const refreshPush = async () => {
          const st = await pushStatus();
          status.textContent = PUSH_TEXT[st.state];
          pushSw.checked = st.state === "on";
          pushSw.disabled = !(st.state === "on" || st.state === "off");
          pushSw.dataset.key = st.key || "";
        };
        refreshPush();
        pushSw.addEventListener("change", async () => {
          pushSw.disabled = true;
          try {
            if (pushSw.checked) { if (!(await enablePush(pushSw.dataset.key))) toast("Ruxsat berilmadi", "bell-off"); else toast("Bildirishnomalar yoqildi", "bell-ring"); }
            else { await disablePush(); toast("Bildirishnomalar o'chirildi", "bell-off"); }
          } catch (e) { fail(e); }
          refreshPush();
        });
        // Quiet hours (this phone) and theme.
        const qOn = $("[data-quiet-on]", el), qFrom = $("[data-quiet-from]", el), qTo = $("[data-quiet-to]", el);
        const saveQuietUI = () => { saveQuiet({ on: qOn.checked, from: qFrom.value || "23:00", to: qTo.value || "07:00" }); };
        [qOn, qFrom, qTo].forEach((x) => x.addEventListener("change", () => { saveQuietUI(); toast(qOn.checked ? `🌙 ${qFrom.value}–${qTo.value} ovozsiz` : "Tinch soatlar o'chirildi", "moon"); }));
        $("[data-theme-choice]", el).addEventListener("change", (e) => { setTheme(e.target.value); });
        $("[data-push-test]", el).addEventListener("click", async () => {
          try { await Store.notify("test", {}, null, { toSelf: true }); toast("Sinov xabari yuborildi", "send"); } catch (e) { fail(e); }
        });

        // Meal times (family) and reminder lead (this person).
        const times = {};
        ["breakfast", "lunch", "dinner"].forEach((k) => { times[k] = $(`[data-set-${k}]`, el); });
        Store.getSettings().then((s) => {
          Object.keys(times).forEach((k) => { if (s[k]) times[k].value = s[k]; });
          const r = $(`[data-lead] input[value="${s.leadHours}"]`, el); if (r) r.checked = true;
        }).catch(() => {});
        const saveTimes = async () => {
          const v = {};
          Object.keys(times).forEach((k) => { v[k] = times[k].value; });
          if (!v.breakfast || !v.lunch || !v.dinner) return;
          let tz = null; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) {}
          try { await Store.saveFamilyTimes({ ...v, timezone: tz }); toast("Vaqtlar saqlandi", "clock"); } catch (e) { fail(e); }
        };
        Object.values(times).forEach((inp) => inp.addEventListener("change", saveTimes));
        $$("[data-lead] input", el).forEach((r) => r.addEventListener("change", async () => {
          try { await Store.saveLeadHours(Number(r.value)); toast("Eslatma saqlandi", "bell-ring"); } catch (e) { fail(e); }
        }));

        $("[data-pair-show]", el).addEventListener("click", () => { api.close(); setTimeout(() => showPairCode(), 300); });
        $("[data-pair-enter]", el).addEventListener("click", () => { api.close(); setTimeout(() => enterPairCode(), 300); });
        $("[data-out]", el).addEventListener("click", async () => {
          api.close();
          if (!(await confirmSheet("Bu telefon oiladan uziladi. Ma'lumotlar o'chmaydi — juftingiz bergan kod bilan qayta ulanish mumkin.", "Telefonni uzish"))) return;
          await withTimeout(disablePushQuietly());
          Store.forgetDevice(); location.href = "kirish.html";
        });
        const sw = $("[data-switch]", el);
        if (sw) sw.addEventListener("click", async () => { Store.chooseMe(c.partner.id); await withTimeout(rebindPush(c.partner)); location.reload(); });
      },
    });
  }

  /* ---------- per-phone preferences: quiet hours and theme ----------
     Quiet hours are read by the service worker when a push arrives, so they are mirrored into
     Cache Storage (the worker can't read localStorage). */
  const QUIET_KEY = "oila-quiet", THEME_KEY = "oila-theme";
  function quietPrefs() {
    try { return { on: false, from: "23:00", to: "07:00", ...(JSON.parse(localStorage.getItem(QUIET_KEY)) || {}) }; }
    catch (e) { return { on: false, from: "23:00", to: "07:00" }; }
  }
  function saveQuiet(q) {
    try { localStorage.setItem(QUIET_KEY, JSON.stringify(q)); } catch (e) {}
    if (window.caches) caches.open("oila-prefs").then((c) => c.put("prefs/quiet", new Response(JSON.stringify(q), { headers: { "Content-Type": "application/json" } }))).catch(() => {});
  }
  const theme = () => { try { return localStorage.getItem(THEME_KEY) || "auto"; } catch (e) { return "auto"; } };
  function applyTheme(t = theme()) {
    const root = document.documentElement;
    if (t === "auto") delete root.dataset.theme; else root.dataset.theme = t;
    const dark = t === "dark" || (t === "auto" && window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", dark ? "#17131F" : "#FFF8EC");
  }
  function setTheme(t) { try { localStorage.setItem(THEME_KEY, t); } catch (e) {} applyTheme(t); }
  applyTheme(); // runs in <head>, before the page paints
  if (window.matchMedia) matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => applyTheme());

  /* ---------- task reminders (runs on every page) ---------- */
  async function checkReminders() {
    let tasks;
    try { tasks = await Store.list("tasks"); } catch (e) { return; }
    const now = Date.now();
    for (const t of tasks) {
      if (t.done || t.reminded || !t.remind_at || new Date(t.remind_at).getTime() > now) continue;
      if (t.assignee_id && !isMe(t.assignee_id)) continue;
      toast(`Eslatma: ${t.title}`, "alarm-clock");
      browserPush({ id: t.id, text: `Eslatma: ${t.title}` });
      try { await Store.update("tasks", t.id, { reminded: true }); } catch (e) {}
    }
  }

  /* ---------- grocery notification batching ----------
     Many X / ✓ taps become ONE notification: sent 1 minute after the last tap, or as soon as
     the page is hidden or left. The queue lives in localStorage, so a page change can't lose it;
     a later batch on the same day says "yana". */
  const GQ_KEY = "oila-grocery-queue", GQ_WAIT = 60 * 1000;
  const GQ_LINK = { grocery_need: "rozgor.html?view=need", grocery_bought: "rozgor.html?view=bought" };
  let gqTimer = null;
  const gqKey = () => GQ_KEY + "-" + (Store.ctx ? Store.ctx.profile.id : "");
  const gqRead = () => { try { return JSON.parse(localStorage.getItem(gqKey())) || {}; } catch (e) { return {}; } };
  const gqWrite = (q) => { try { Object.keys(q).length ? localStorage.setItem(gqKey(), JSON.stringify(q)) : localStorage.removeItem(gqKey()); } catch (e) {} };
  function queueGrocery(type, name) {
    const q = gqRead();
    const list = (q[type] = q[type] || []);
    if (!list.includes(name)) list.push(name);
    gqWrite(q);
    clearTimeout(gqTimer);
    gqTimer = setTimeout(flushGroceries, GQ_WAIT);
  }
  function unqueueGrocery(type, name) {
    const q = gqRead();
    if (!q[type]) return;
    q[type] = q[type].filter((n) => n !== name);
    if (!q[type].length) delete q[type];
    gqWrite(q);
  }
  function flushGroceries() {
    clearTimeout(gqTimer); gqTimer = null;
    if (!Store.ctx) return;
    const q = gqRead();
    if (!Object.keys(q).length) return;
    gqWrite({}); // claim first, so a second flush (hide + unload) can't send twice
    const today = ymd(new Date());
    for (const type of Object.keys(q)) {
      const dayKey = `oila-grocery-last-${type}-${Store.ctx.profile.id}`;
      let again = false;
      try { again = localStorage.getItem(dayKey) === today; localStorage.setItem(dayKey, today); } catch (e) {}
      Store.notify(type, { items: q[type], again }, GQ_LINK[type]);
    }
  }
  document.addEventListener("visibilitychange", () => { if (document.hidden) flushGroceries(); });
  window.addEventListener("pagehide", flushGroceries);

  /**
   * Boot a page: ensure this phone knows its family and person, render chrome, wire realtime.
   * opts: { page, title, sub, home, tables, render(ctx) }
   */
  async function boot(opts) {
    teardownPage();
    const gen = pageGen;
    let ctx;
    try { ctx = Store.ctx || await Store.session(); }
    catch (e) {
      console.error(e);
      $(".app").innerHTML = `<div class="empty" style="margin:auto"><div class="ico"><i data-lucide="wifi-off"></i></div><strong>Ulanib bo'lmadi</strong><p>Internetni tekshirib, qayta urinib ko'ring.</p><button class="btn primary" onclick="location.reload()">Qayta urinish</button></div>`;
      return icons();
    }
    if (!ctx || !ctx.profile) { location.replace("kirish.html"); return; }
    Store.ctx = ctx;
    flushGroceries(); // a batch left over from a page that was closed mid-wait

    const app = $(".app");
    const tab = TABS.find((t) => t.id === opts.page);
    if (!app.dataset.section && tab) app.dataset.section = tab.section;
    app.insertAdjacentHTML("afterbegin", topbar(opts));
    if (Store.mode === "demo") {
      $(".topbar").insertAdjacentHTML("afterend", `<div class="demo-banner"><i data-lucide="flask-conical"></i><span>Demo: siz <b>${esc(firstName(ctx.profile))}</b></span><button id="demo-switch">${esc(firstName(ctx.partner))} bo'lish</button></div>`);
      $("#demo-switch").addEventListener("click", () => { Store.chooseMe(ctx.partner.id); location.reload(); });
    }
    app.insertAdjacentHTML("beforeend", tabbar(opts.page));
    $("#bell").addEventListener("click", openNotifications);
    $("#me-btn").addEventListener("click", openProfile);
    $("#settings-btn").addEventListener("click", openProfile);
    icons();

    await refreshBell();
    let pending = null;
    const rerender = () => { clearTimeout(pending); pending = setTimeout(() => gen === pageGen && opts.render && opts.render(ctx), 120); };
    onLeave(() => clearTimeout(pending));
    const unsubscribe = Store.subscribe(Array.from(new Set([...(opts.tables || []), "notifications"])), (table, payload) => {
      if (table === "notifications" || table === "*") {
        refreshBell();
        if (payload && payload.eventType === "INSERT" && payload.new && payload.new.recipient_id === ctx.profile.id) {
          toast(payload.new.text, MODULE_ICON[payload.new.module] || "bell");
          browserPush(payload.new);
        }
      }
      if (table === "*" || (opts.tables || []).includes(table)) rerender();
    });
    onLeave(() => { if (typeof unsubscribe === "function") unsubscribe(); });
    if (opts.render) await opts.render(ctx);
    icons();
    checkReminders();
    const remindTimer = setInterval(checkReminders, 60000);
    onLeave(() => clearInterval(remindTimer));
    resyncPush(ctx);
    prefetchPages();
  }

  /* ---------- installable app ---------- */
  let installEvent = null;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvent = e; });
  window.addEventListener("appinstalled", () => { installEvent = null; });
  const isStandalone = () => (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
  /** "installed" | "prompt" (browser can show its install dialog) | "ios" (Share > Add to Home Screen) | "unsupported" */
  function installState() {
    if (isStandalone()) return "installed";
    if (installEvent) return "prompt";
    if (/iphone|ipad|ipod/i.test(navigator.userAgent)) return "ios";
    return "unsupported";
  }
  /** Shows the browser install dialog; resolves "accepted" | "dismissed" | "unavailable". */
  async function install() {
    if (!installEvent) return "unavailable";
    const ev = installEvent;
    installEvent = null;
    await ev.prompt();
    const choice = await ev.userChoice;
    return choice ? choice.outcome : "dismissed";
  }
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch((e) => console.warn("sw", e)));
  }

  /* ---------- instant section switching (one page, like a single index.html) ----------
     Every section is still its own HTML file (bookmarks, reloads and offline keep working),
     but tab taps no longer load a new document: the target page is fetched once (then kept in
     memory), its .app content and page styles are swapped in, and its script runs again inside
     its own function scope. Each page script gets App.$/$$ bound to ITS OWN .app element, so a
     late callback from the page you left can only touch its detached old DOM. */
  const SPA_PAGES = TABS.map((t) => t.href);
  const pageCache = new Map();
  let pageGen = 0, leaveFns = [];
  const onLeave = (fn) => leaveFns.push(fn);
  function teardownPage() { const fns = leaveFns; leaveFns = []; fns.forEach((fn) => { try { fn(); } catch (e) {} }); }
  const pageOf = (href) => { try { const u = new URL(href, location.href); return u.origin === location.origin && SPA_PAGES.includes(u.pathname.split("/").pop() || "index.html") ? u : null; } catch (e) { return null; } };

  function loadPage(file) {
    if (!pageCache.has(file)) {
      pageCache.set(file, fetch(file, { credentials: "same-origin" }).then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); }).then((html) => {
        const doc = new DOMParser().parseFromString(html, "text/html");
        const app = doc.querySelector(".app");
        const script = [...doc.querySelectorAll("body script:not([src])")].map((x) => x.textContent).join("\n");
        if (!app || !script) throw new Error("not an app page");
        return { title: doc.title, styles: [...doc.head.querySelectorAll("style")].map((x) => x.textContent), attrs: [...app.attributes].map((a) => [a.name, a.value]), html: app.innerHTML, script };
      }).catch((e) => { pageCache.delete(file); throw e; }));
    }
    return pageCache.get(file);
  }
  function prefetchPages() {
    if (prefetchPages.done) return; prefetchPages.done = true;
    const run = () => SPA_PAGES.forEach((f) => loadPage(f).catch(() => {}));
    (window.requestIdleCallback || ((fn) => setTimeout(fn, 300)))(run);
  }

  async function go(href, push = true) {
    const url = pageOf(href);
    if (!url || !Store.ctx) { location.href = href; return; }
    const file = url.pathname.split("/").pop() || "index.html";
    let page;
    try { page = await loadPage(file); } catch (e) { location.href = href; return; }
    flushGroceries(); // what pagehide used to do
    teardownPage();
    pageGen++;
    document.querySelectorAll(".sheet, .sheet-backdrop").forEach((n) => n.remove());
    document.head.querySelectorAll("style").forEach((n) => n.remove());
    page.styles.forEach((css) => { const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st); });
    const old = document.querySelector(".app");
    const app = document.createElement("div");
    page.attrs.forEach(([k, v]) => app.setAttribute(k, v));
    app.innerHTML = page.html;
    old.replaceWith(app);
    document.title = page.title;
    if (push) history.pushState({ spa: true }, "", url.pathname.split("/").pop() + url.search + url.hash);
    // The new page script captures App.$/$$ scoped to its own .app element.
    App.$ = (sel, root = app) => root.querySelector(sel);
    App.$$ = (sel, root = app) => Array.from(root.querySelectorAll(sel));
    const run = document.createElement("script");
    run.textContent = "(function () {\n" + page.script + "\n})();";
    document.body.appendChild(run);
    run.remove();
  }

  // Intercept taps on links to the five sections (tab bar, quick actions, notification links).
  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest && e.target.closest("a[href]");
    if (!a || a.target || a.hasAttribute("download") || !pageOf(a.getAttribute("href"))) return;
    e.preventDefault();
    go(a.getAttribute("href"));
  });
  window.addEventListener("popstate", () => { if (pageOf(location.href)) go(location.href, false); });

  // The first page loaded normally also gets lookups bound to ITS .app (captured on first use),
  // so a slow first render finishing after an in-app switch can't write into the next section.
  let firstApp = null;
  const firstRoot = () => firstApp || (firstApp = document.querySelector(".app")) || document;
  const firstPage$ = (sel, root = firstRoot()) => root.querySelector(sel);
  const firstPage$$ = (sel, root = firstRoot()) => Array.from(root.querySelectorAll(sel));
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", firstRoot, { once: true }); else firstRoot();

  window.App = {
    go, onLeave,
    queueGrocery, unqueueGrocery, flushGroceries,
    installState, install,
    boot, sheet, showPairCode, enterPairCode, confirm: confirmSheet, toast, undoToast, fail, icons, esc, $: firstPage$, $$: firstPage$$,
    person, nameOf, firstName, isMe, avatar, timeAgo, greeting,
    ymd, parseYmd, today, addDays, fmtLong, fmtDate, fmtShort,
    MONTHS, WEEKDAYS, WEEKDAYS_SHORT, logoSvg, logoMark,
  };
})();
