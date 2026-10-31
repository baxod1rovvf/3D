// @ts-nocheck
// Oila Uchun — "push" Edge Function. Deploy with "Verify JWT" OFF.
//   GET  ?public_key            -> { publicKey }   (VAPID key for the site; created on first use)
//   POST { notification_id }    -> { sent }        (called by the notifications trigger)
//   POST { tick: true }         -> { sent }        (called every 5 minutes by pg_cron: meal reminders)
// Safe to call publicly: it only re-sends recent, existing notification rows to their recipient,
// and meal reminders are claimed once per person, day and meal.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.117.0";

/*@@INLINE@@*/

const { PushLogic } = globalThis;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-family-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const db = createClient(
  Deno.env.get("SUPABASE_URL"),
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function must({ data, error }) {
  if (error) throw new Error(error.message || String(error));
  return data;
}

// VAPID keys: generated once and kept in push_keys (id = 1).
let keysPromise = null;
function vapidKeys() {
  keysPromise = keysPromise || (async () => {
    let row = must(await db.from("push_keys").select("public_key, private_key").eq("id", 1).maybeSingle());
    if (!row) {
      const k = webpush.generateVAPIDKeys();
      must(await db.from("push_keys").upsert({ id: 1, public_key: k.publicKey, private_key: k.privateKey },
        { onConflict: "id", ignoreDuplicates: true }));
      row = must(await db.from("push_keys").select("public_key, private_key").eq("id", 1).single());
    }
    return { publicKey: row.public_key, privateKey: row.private_key };
  })().catch((e) => { keysPromise = null; throw e; });
  return keysPromise;
}

async function sendNotificationRow(id) {
  const n = must(await db.from("notifications").select("*").eq("id", id).maybeSingle());
  if (!n || !PushLogic.isFresh(n, new Date())) return 0;
  const subs = PushLogic.pickRecipients(n, must(await db.from("push_subscriptions").select("*")
    .eq("household_id", n.household_id).eq("profile_id", n.recipient_id)));
  if (!subs.length) return 0;
  const { publicKey, privateKey } = await vapidKeys();
  const payload = JSON.stringify(PushLogic.payloadFor(n));
  let sent = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(s.subscription, payload, {
        vapidDetails: { subject: "mailto:oila@example.com", publicKey, privateKey },
        TTL: 3600,
      });
      sent++;
    } catch (e) {
      if (e && (e.statusCode === 404 || e.statusCode === 410)) {
        await db.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
      } else {
        console.warn("push failed", s.endpoint, e && (e.statusCode || e.message));
      }
    }
  }));
  return sent;
}

// Meal reminders: claim each due one, then insert a notification (its trigger sends the push).
// Only for people with a lead time and at least one subscribed phone.
async function tick() {
  const now = new Date();
  const day = (offset) => new Date(now.getTime() + offset * 86400000).toISOString().slice(0, 10);
  const profiles = must(await db.from("profiles").select("id, household_id, meal_lead_hours").gt("meal_lead_hours", 0));
  if (!profiles.length) return 0;
  const subscriptions = must(await db.from("push_subscriptions").select("household_id, profile_id"));
  if (!subscriptions.length) return 0;
  const settings = must(await db.from("family_settings").select("*"));
  const meals = must(await db.from("meals").select("household_id, day_date, slot, title")
    .gte("day_date", day(-1)).lte("day_date", day(2)));
  const jobs = PushLogic.reminderJobs({ profiles, settings, meals, subscriptions, now });
  let queued = 0;
  for (const j of jobs) {
    const claim = await db.from("meal_reminders_sent")
      .insert({ household_id: j.household_id, profile_id: j.profile_id, day: j.day, slot: j.slot });
    if (claim.error) {
      if (claim.error.code !== "23505") console.warn("claim failed", claim.error.message);
      continue; // already reminded (or could not claim): skip
    }
    const ins = await db.from("notifications").insert(j.notification);
    if (ins.error) console.warn("reminder insert failed", ins.error.message);
    else queued++;
  }
  return queued;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  try {
    const url = new URL(req.url);
    if (req.method === "GET" && url.searchParams.has("public_key")) {
      return json({ publicKey: (await vapidKeys()).publicKey });
    }
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      if (body && typeof body === "object" && "notification_id" in body) {
        if (!UUID.test(String(body.notification_id))) return json({ error: "bad_notification_id" }, 400);
        return json({ sent: await sendNotificationRow(body.notification_id) });
      }
      if (body && body.tick === true) return json({ sent: await tick() });
    }
    return json({ error: "bad_request" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: "server_error" }, 500);
  }
});
