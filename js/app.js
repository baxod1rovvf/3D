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
  function toast(text, icon = "check") {
    let wrap = $(".toast-wrap");
    if (!wrap) { wrap = document.createElement("div"); wrap.className = "toast-wrap"; wrap.setAttribute("role", "status"); wrap.setAttribute("aria-live", "polite"); $(".app").appendChild(wrap); }
    const t = document.createElement("div");
    t.className = "toast";
    t.innerHTML = `<i data-lucide="${icon}"></i><span>${esc(text)}</span>`;
    wrap.appendChild(t); icons();
    setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 220); }, 2600);
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
          if (href && href !== "#" && !location.pathname.endsWith(href)) location.href = href;
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

  /** "Qurilmani ulash": show a 6-digit code the partner types on their phone. */
  async function showPairCode(target) {
    const render = async (box) => {
      box.innerHTML = `<div class="skeleton" style="height:64px;margin:6px 0"></div>`;
      let code;
      try { code = await Store.createPairCode(); }
      catch (e) { console.error(e); box.innerHTML = `<p class="error-text">Kod olinmadi. Internetni tekshirib, qayta urinib ko'ring.</p>`; return; }
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
          if (!k || !(await Store.joinFamily(k))) { err.textContent = "Kod noto'g'ri yoki eskirgan. Juftingizdan yangi kod so'rang."; err.hidden = false; btn.disabled = false; return; }
          Store.Device.del("oila-me");
          done && done(); onJoined ? onJoined() : (location.href = "kirish.html");
        } catch (ex) {
          console.error(ex);
          err.textContent = /too_many/.test(ex.message || "") ? "Juda ko'p urinish bo'ldi. 10 daqiqadan so'ng qayta urinib ko'ring." : "Ulanib bo'lmadi. Internetni tekshirib, qayta urinib ko'ring.";
          err.hidden = false; btn.disabled = false;
        }
      });
      setTimeout(() => inp.focus(), 300);
    };
    if (inline) { inline.innerHTML = html; wire(inline); return; }
    sheet({ title: "Menda kod bor", body: html, onMount(el, api) { wire(el, () => api.close()); } });
  }

  function openProfile() {
    const c = Store.ctx;
    const demo = Store.mode === "demo";
    sheet({
      title: "Sozlamalar",
      body: `<div class="card list">
          <div class="row">${avatar(c.profile)}<div class="grow"><div class="title">${esc(c.profile.full_name)} <span class="chip">Siz</span></div><div class="meta">${c.profile.role === "er" ? "Er" : "Xotin"}</div></div></div>
          ${c.partner ? `<div class="row">${avatar(c.partner)}<div class="grow"><div class="title">${esc(c.partner.full_name)}</div><div class="meta">${c.partner.role === "er" ? "Er" : "Xotin"}</div></div></div>` : ""}
        </div>
        <div class="section"><div class="section-head"><h2>Qurilmalar</h2></div>
          <div class="card list">
            <button class="row" data-pair-show style="width:100%;border:0;background:none;text-align:left"><i data-lucide="smartphone"></i><div class="grow"><div class="title">Qurilmani ulash</div><div class="meta">Juftingiz telefoni uchun kod olish</div></div><i data-lucide="chevron-right"></i></button>
            <button class="row" data-pair-enter style="width:100%;border:0;background:none;text-align:left"><i data-lucide="keyboard"></i><div class="grow"><div class="title">Menda kod bor</div><div class="meta">Juftingiz bergan kodni kiritish</div></div><i data-lucide="chevron-right"></i></button>
          </div></div>
        ${demo ? `<p class="hint" style="margin-top:14px">Demo rejim: ma'lumotlar faqat shu brauzerda. Ikki telefon o'rtasida ulashish uchun js/config.js ga Supabase manzili va kalitini yozing.</p>` : ""}`,
      foot: `${c.partner ? `<button class="btn ghost" data-switch><i data-lucide="repeat"></i>Men ${esc(firstName(c.partner))}man</button>` : ""}<button class="btn danger" data-out><i data-lucide="unplug"></i>Uzish</button>`,
      onMount(el, api) {
        $("[data-pair-show]", el).addEventListener("click", () => { api.close(); setTimeout(() => showPairCode(), 300); });
        $("[data-pair-enter]", el).addEventListener("click", () => { api.close(); setTimeout(() => enterPairCode(), 300); });
        $("[data-out]", el).addEventListener("click", async () => {
          api.close();
          if (!(await confirmSheet("Bu telefon oiladan uziladi. Ma'lumotlar o'chmaydi — juftingiz bergan kod bilan qayta ulanish mumkin.", "Telefonni uzish"))) return;
          Store.forgetDevice(); location.href = "kirish.html";
        });
        const sw = $("[data-switch]", el);
        if (sw) sw.addEventListener("click", () => { Store.chooseMe(c.partner.id); location.reload(); });
      },
    });
  }

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

  /**
   * Boot a page: ensure this phone knows its family and person, render chrome, wire realtime.
   * opts: { page, title, sub, home, tables, render(ctx) }
   */
  async function boot(opts) {
    let ctx;
    try { ctx = await Store.session(); }
    catch (e) {
      console.error(e);
      $(".app").innerHTML = `<div class="empty" style="margin:auto"><div class="ico"><i data-lucide="wifi-off"></i></div><strong>Ulanib bo'lmadi</strong><p>Internetni tekshirib, qayta urinib ko'ring.</p><button class="btn primary" onclick="location.reload()">Qayta urinish</button></div>`;
      return icons();
    }
    if (!ctx || !ctx.profile) { location.replace("kirish.html"); return; }
    Store.ctx = ctx;

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
    const rerender = () => { clearTimeout(pending); pending = setTimeout(() => opts.render && opts.render(ctx), 120); };
    Store.subscribe(Array.from(new Set([...(opts.tables || []), "notifications"])), (table, payload) => {
      if (table === "notifications" || table === "*") {
        refreshBell();
        if (payload && payload.eventType === "INSERT" && payload.new && payload.new.recipient_id === ctx.profile.id) {
          toast(payload.new.text, MODULE_ICON[payload.new.module] || "bell");
          browserPush(payload.new);
        }
      }
      if (table === "*" || (opts.tables || []).includes(table)) rerender();
    });
    if (opts.render) await opts.render(ctx);
    icons();
    checkReminders();
    setInterval(checkReminders, 60000);
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

  window.App = {
    installState, install,
    boot, sheet, showPairCode, enterPairCode, confirm: confirmSheet, toast, fail, icons, esc, $, $$,
    person, nameOf, firstName, isMe, avatar, timeAgo, greeting,
    ymd, parseYmd, today, addDays, fmtLong, fmtDate, fmtShort,
    MONTHS, WEEKDAYS, WEEKDAYS_SHORT, logoSvg, logoMark,
  };
})();
