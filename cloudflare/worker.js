// Oila Uchun — Cloudflare Worker + D1 backend.
// Paste this whole file into your Worker (Cloudflare dashboard → Edit code → Deploy) and bind
// a D1 database to it with the variable name DB. Tables are created automatically.
//
// There are no accounts. Every request carries the family's secret key (header X-Family-Key,
// or ?k= for photos), and every query is limited to rows of that family.

const TABLES = ["profiles", "grocery_items", "meals", "memories", "tasks", "activity", "notifications"];
const MAX_PHOTO_BYTES = 1_900_000; // D1 row limit is 2 MB; the app compresses photos well below this

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS households (key TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS records (id TEXT PRIMARY KEY, household_id TEXT NOT NULL, tbl TEXT NOT NULL, data TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS records_family ON records (household_id, tbl)`,
  `CREATE TABLE IF NOT EXISTS versions (household_id TEXT NOT NULL, tbl TEXT NOT NULL, v INTEGER NOT NULL, PRIMARY KEY (household_id, tbl))`,
  `CREATE TABLE IF NOT EXISTS pair_codes (code TEXT PRIMARY KEY, household_id TEXT NOT NULL, expires_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS pair_failures (at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS photos (id TEXT PRIMARY KEY, household_id TEXT NOT NULL, bytes BLOB NOT NULL, created_at TEXT NOT NULL)`,
];

let migrated = false;
async function migrate(db) {
  if (migrated) return;
  await db.batch(SCHEMA.map((s) => db.prepare(s)));
  migrated = true;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Family-Key",
  "Access-Control-Max-Age": "86400",
};
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const fail = (status, error) => json({ error }, status);
const now = () => new Date().toISOString();

function bump(db, key, tbl) {
  return db.prepare(`INSERT INTO versions (household_id, tbl, v) VALUES (?, ?, 1) ON CONFLICT (household_id, tbl) DO UPDATE SET v = v + 1`).bind(key, tbl);
}
const rowOut = (r) => ({ ...JSON.parse(r.data), id: r.id, household_id: r.household_id });

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (!env.DB) return fail(500, "D1 database is not bound. Add a D1 binding named DB in the Worker settings.");
    try {
      await migrate(env.DB);
      return await route(request, env.DB);
    } catch (e) {
      return fail(500, String(e && e.message || e));
    }
  },
};

async function route(request, db) {
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const method = request.method;

  if (parts.length === 0) return json({ ok: true, app: "Oila Uchun" });

  // Create a new family. The server makes the secret key.
  if (parts[0] === "family" && method === "POST") {
    const body = await request.json();
    const members = Array.isArray(body.members) ? body.members.slice(0, 2) : [];
    if (members.length !== 2) return fail(400, "two members required");
    const key = crypto.randomUUID();
    const t = now();
    await db.batch([
      db.prepare(`INSERT INTO households (key, name, created_at) VALUES (?, ?, ?)`).bind(key, String(body.name || "Bizning uy").slice(0, 60), t),
      ...members.map((m) => db.prepare(`INSERT INTO records (id, household_id, tbl, data) VALUES (?, ?, 'profiles', ?)`)
        .bind(crypto.randomUUID(), key, JSON.stringify({ full_name: String(m.full_name || "").slice(0, 40), role: m.role === "er" ? "er" : "xotin", created_at: t }))),
    ]);
    return json({ key });
  }

  // The other phone enters a 6-digit code and receives the family key. Codes work once.
  if (parts[0] === "pair" && parts[1] === "claim" && method === "POST") {
    const { code } = await request.json();
    const t = Date.now();
    await db.prepare(`DELETE FROM pair_failures WHERE at < ?`).bind(t - 600000).run();
    const { n } = await db.prepare(`SELECT COUNT(*) AS n FROM pair_failures`).first();
    if (n >= 30) return fail(429, "too_many_attempts");
    const row = await db.prepare(`SELECT household_id FROM pair_codes WHERE code = ? AND expires_at > ?`).bind(String(code || "").trim(), t).first();
    if (!row) { await db.prepare(`INSERT INTO pair_failures (at) VALUES (?)`).bind(t).run(); return fail(404, "code not found"); }
    await db.prepare(`DELETE FROM pair_codes WHERE code = ?`).bind(String(code).trim()).run();
    return json({ key: row.household_id });
  }

  const key = request.headers.get("X-Family-Key") || url.searchParams.get("k");
  if (!key || key.length < 30) return fail(401, "family key required");
  const household = await db.prepare(`SELECT key AS id, name, created_at FROM households WHERE key = ?`).bind(key).first();
  if (!household) return fail(404, "family not found");

  // "Qurilmani ulash": a fresh 6-digit code for this family, valid 10 minutes.
  if (parts[0] === "pair" && !parts[1] && method === "POST") {
    const t = Date.now();
    await db.prepare(`DELETE FROM pair_codes WHERE expires_at < ? OR household_id = ?`).bind(t, key).run();
    for (;;) {
      const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, "0");
      const taken = await db.prepare(`SELECT 1 FROM pair_codes WHERE code = ?`).bind(code).first();
      if (taken) continue;
      await db.prepare(`INSERT INTO pair_codes (code, household_id, expires_at) VALUES (?, ?, ?)`).bind(code, key, t + 600000).run();
      return json({ code });
    }
  }

  // Family name and both members.
  if (parts[0] === "family" && method === "GET") {
    const { results } = await db.prepare(`SELECT * FROM records WHERE household_id = ? AND tbl = 'profiles'`).bind(key).all();
    return json({ household, members: results.map(rowOut) });
  }

  // Change counters, polled by the phones to stay in sync.
  if (parts[0] === "versions" && method === "GET") {
    const { results } = await db.prepare(`SELECT tbl, v FROM versions WHERE household_id = ?`).bind(key).all();
    return json(Object.fromEntries(results.map((r) => [r.tbl, r.v])));
  }

  if (parts[0] === "rows") {
    const tbl = parts[1];
    if (!TABLES.includes(tbl)) return fail(400, "unknown table");
    const id = parts[2];

    if (method === "GET") {
      let sql = `SELECT * FROM records WHERE household_id = ? AND tbl = ?`;
      const args = [key, tbl];
      const recipient = url.searchParams.get("recipient_id");
      if (recipient) { sql += ` AND json_extract(data, '$.recipient_id') = ?`; args.push(recipient); }
      const { results } = await db.prepare(sql).bind(...args).all();
      return json(results.map(rowOut));
    }
    if (method === "POST") {
      const { rows } = await request.json();
      if (!Array.isArray(rows) || !rows.length || rows.length > 100) return fail(400, "rows required");
      const out = rows.map((r) => {
        const { id: rid, household_id, ...data } = r;
        return { id: typeof rid === "string" && rid.length >= 20 ? rid : crypto.randomUUID(), data };
      });
      await db.batch([
        ...out.map((r) => db.prepare(`INSERT INTO records (id, household_id, tbl, data) VALUES (?, ?, ?, ?)`).bind(r.id, key, tbl, JSON.stringify(r.data))),
        bump(db, key, tbl),
      ]);
      return json(out.map((r) => ({ ...r.data, id: r.id, household_id: key })));
    }
    if (method === "PATCH") {
      const body = await request.json();
      const ids = id ? [id] : Array.isArray(body.ids) ? body.ids.slice(0, 500) : [];
      const { household_id, id: _ignored, ...patch } = body.patch || {};
      if (!ids.length) return json({ updated: 0 });
      // json_patch drops keys set to null, which the app reads the same as null.
      await db.batch([
        ...ids.map((rid) => db.prepare(`UPDATE records SET data = json_patch(data, ?) WHERE id = ? AND household_id = ? AND tbl = ?`).bind(JSON.stringify(patch), rid, key, tbl)),
        bump(db, key, tbl),
      ]);
      return json({ updated: ids.length });
    }
    if (method === "DELETE" && id) {
      await db.batch([
        db.prepare(`DELETE FROM records WHERE id = ? AND household_id = ? AND tbl = ?`).bind(id, key, tbl),
        bump(db, key, tbl),
      ]);
      return json({ deleted: 1 });
    }
  }

  // Memory photos (JPEG bytes). <img> tags can't send headers, so reads use ?k=<key>.
  if (parts[0] === "photos") {
    const pid = parts[1];
    if (method === "POST") {
      const bytes = await request.arrayBuffer();
      if (!bytes.byteLength || bytes.byteLength > MAX_PHOTO_BYTES) return fail(413, "photo too large");
      const newId = crypto.randomUUID();
      await db.prepare(`INSERT INTO photos (id, household_id, bytes, created_at) VALUES (?, ?, ?, ?)`).bind(newId, key, bytes, now()).run();
      return json({ id: newId });
    }
    if (method === "GET" && pid) {
      const row = await db.prepare(`SELECT bytes FROM photos WHERE id = ? AND household_id = ?`).bind(pid, key).first();
      if (!row) return fail(404, "photo not found");
      return new Response(new Uint8Array(row.bytes), { headers: { ...CORS, "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=31536000, immutable" } });
    }
    if (method === "DELETE" && pid) {
      await db.prepare(`DELETE FROM photos WHERE id = ? AND household_id = ?`).bind(pid, key).run();
      return json({ deleted: 1 });
    }
  }

  return fail(404, "not found");
}
