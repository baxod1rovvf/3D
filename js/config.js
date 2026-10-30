// Oila Uchun — settings.
// Supabase: Project Settings → API → copy "Project URL" and the "anon public" key here,
// after running supabase/schema.sql in the SQL Editor (see README).
// These two values are not secrets; the family's private key lives only in the family link.
// If they are empty, the app runs in "Demo rejim" (data stays in this browser only).
window.OILA_CONFIG = {
  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: "",

  // Optional alternative instead of Supabase: a Cloudflare Worker address (cloudflare/worker.js).
  API_URL: "",
};
