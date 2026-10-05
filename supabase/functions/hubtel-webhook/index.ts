import { createClient } from "npm:@supabase/supabase-js@2";

const PRICE = 50.00;
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "https://trotromall.com";
const HUBTEL_BASE = (Deno.env.get("HUBTEL_API_BASE_URL") || "https://payproxyapi.hubtel.com").replace(/\/$/, "");

function adminClient() {
  const modern = Deno.env.get("SUPABASE_SECRET_KEYS");
  let key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (modern) {
    try { key = JSON.parse(modern).default || key; } catch (_) {}
  }
  return createClient(Deno.env.get("SUPABASE_URL")!, key, { auth: { persistSession: false } });
}

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": ALLOWED_ORIGIN },
  });
}

function first(...values: unknown[]) {
  return values.find(v => v !== undefined && v !== null && String(v).trim() !== "");
}

async function verifyWithHubtel(clientReference: string, transactionId: string | null, expectedAmount: number) {
  const id = Deno.env.get("HUBTEL_API_ID");
  const key = Deno.env.get("HUBTEL_API_KEY");
  if (!id || !key) return { ok: false, reason: "gateway credentials missing" };
  const auth = btoa(`${id}:${key}`);

  const urls = transactionId
    ? [`${HUBTEL_BASE}/transaction/${encodeURIComponent(transactionId)}`]
    : [];
  urls.push(`${HUBTEL_BASE}/transaction/status`);

  for (const url of urls) {
    const init: RequestInit = {
      method: url.endsWith("/status") ? "POST" : "GET",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    };
    if (url.endsWith("/status")) {
      init.body = JSON.stringify({ ClientReference: clientReference, TransactionId: transactionId || undefined });
    }
    try {
      const r = await fetch(url, init);
      if (!r.ok) continue;
      const j = await r.json();
      const d = j?.data || j?.Data || j;
      const status = String(first(d?.status, d?.Status, j?.status, j?.Status) || "").toLowerCase();
      const ref = String(first(d?.clientReference, d?.ClientReference, j?.clientReference, j?.ClientReference) || "");
      const amount = Number(first(d?.amount, d?.Amount, j?.amount, j?.Amount));
      const hubId = String(first(d?.transactionId, d?.TransactionId, transactionId) || "");
      if (ref === clientReference && status === "completed" && amount === expectedAmount) {
        return { ok: true, transactionId: hubId };
      }
    } catch (_) {}
  }
  return { ok: false, reason: "Hubtel status could not be verified" };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return response({ error: "Method not allowed" }, 405);
  const callbackToken = Deno.env.get("HUBTEL_CALLBACK_TOKEN");
  if (callbackToken) {
    const supplied = new URL(req.url).searchParams.get("token");
    if (!supplied || supplied !== callbackToken) return response({ error: "Unauthorized webhook" }, 401);
  }
  try {
    const payload = await req.json();
    const data = payload?.data || payload?.Data || payload;
    const clientReference = String(first(data?.clientReference, data?.ClientReference, payload?.clientReference, payload?.ClientReference) || "");
    const transactionId = String(first(data?.transactionId, data?.TransactionId, payload?.transactionId, payload?.TransactionId) || "") || null;
    const callbackStatus = String(first(data?.status, data?.Status, payload?.status, payload?.Status) || "").toLowerCase();
    const amount = Number(first(data?.amount, data?.Amount, payload?.amount, payload?.Amount));
    const channel = String(first(data?.paymentMethod, data?.PaymentMethod, data?.channel, data?.Channel) || "");

    if (!clientReference) return response({ error: "Missing client reference" }, 400);

    const admin = adminClient();
    const { data: payment, error } = await admin
      .from("payments")
      .select("id,client_reference,amount,payment_status,hubtel_transaction_id")
      .eq("client_reference", clientReference)
      .maybeSingle();
    if (error) throw error;
    if (!payment) return response({ error: "Unknown payment reference" }, 404);

    // A callback is only a trigger. The final decision is made by a server-to-server
    // Hubtel transaction-status check, preventing a forged JSON POST from activating an ad.
    if (callbackStatus !== "completed" || amount !== PRICE) {
      if (["failed", "cancelled", "timeout"].includes(callbackStatus)) {
        await admin.from("payments").update({ payment_status: "failed", hubtel_transaction_id: transactionId }).eq("client_reference", clientReference).neq("payment_status", "completed");
      }
      return response({ received: true, activated: false });
    }

    const verified = await verifyWithHubtel(clientReference, transactionId, PRICE);
    if (!verified.ok) return response({ received: true, activated: false, verification: "pending" }, 202);

    const { data: result, error: rpcError } = await admin.rpc("complete_feature_payment", {
      p_client_reference: clientReference,
      p_hubtel_transaction_id: verified.transactionId || transactionId,
      p_channel: channel,
      p_amount: PRICE,
    });
    if (rpcError) throw rpcError;

    return response({ received: true, activated: Boolean(result?.ok), result });
  } catch (error) {
    console.error("hubtel-webhook", error);
    return response({ error: "Webhook processing failed" }, 500);
  }
});
