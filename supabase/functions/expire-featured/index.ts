import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
  const expected = Deno.env.get("CRON_SECRET");
  if (expected && req.headers.get("x-cron-secret") !== expected) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const modern = Deno.env.get("SUPABASE_SECRET_KEYS");
  let key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (modern) { try { key = JSON.parse(modern).default || key; } catch (_) {} }
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, key, { auth: { persistSession: false } });
  const { data, error } = await supabase.rpc("expire_featured_listings");
  if (error) return Response.json({ error: "Cleanup failed" }, { status: 500 });
  return Response.json({ ok: true, expired: data });
});
