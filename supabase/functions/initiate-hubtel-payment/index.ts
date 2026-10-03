import { createClient } from "npm:@supabase/supabase-js@2";

const PRICE = 50.00;
const DAYS = 7;
const HUBTEL_ENDPOINT = Deno.env.get("HUBTEL_CHECKOUT_ENDPOINT") || "https://payproxyapi.hubtel.com/items/initiate";
const SITE_URL = (Deno.env.get("SITE_URL") || "https://trotromall.com").replace(/\/$/, "");

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || SITE_URL,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function getSecretKey() {
  const modern = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (modern) {
    try {
      const parsed = JSON.parse(modern);
      if (parsed.default) return parsed.default;
    } catch (_) {}
  }
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  throw new Error("Supabase server key is not configured");
}

function createReference(listingId: string) {
  const compact = listingId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12);
  return `TTM-${Date.now()}-${compact}-${crypto.randomUUID().slice(0, 8)}`.slice(0, 32);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Authentication required" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const publicKey = Deno.env.get("SUPABASE_ANON_KEY") || (() => {
      const keys = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
      if (!keys) return "";
      try { return JSON.parse(keys).default || ""; } catch (_) { return ""; }
    })();
    if (!publicKey) return json({ error: "Supabase publishable key is not configured" }, 500);

    const userClient = createClient(supabaseUrl, publicKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: "Invalid or expired session" }, 401);

    const body = await req.json().catch(() => null);
    const listingId = typeof body?.listing_id === "string" ? body.listing_id.trim() : "";
    if (!listingId) return json({ error: "listing_id is required" }, 400);

    const admin = createClient(supabaseUrl, getSecretKey(), { auth: { persistSession: false } });
    const { data: listing, error: listingError } = await admin
      .from("listings")
      .select("id,user_id,title,status")
      .eq("id", listingId)
      .maybeSingle();

    if (listingError) throw listingError;
    if (!listing) return json({ error: "Listing not found" }, 404);
    if (listing.user_id !== user.id) return json({ error: "You can only promote your own listing" }, 403);
    if (listing.status && listing.status !== "active") return json({ error: "Only active listings can be promoted" }, 400);

    const clientReference = createReference(listingId);
    const webhookToken = Deno.env.get("HUBTEL_CALLBACK_TOKEN");
    const callbackUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/hubtel-webhook${webhookToken ? `?token=${encodeURIComponent(webhookToken)}` : ""}`;
    const returnUrl = `${SITE_URL}/payment-result.html?reference=${encodeURIComponent(clientReference)}`;
    const cancellationUrl = `${SITE_URL}/payment-result.html?status=cancelled&reference=${encodeURIComponent(clientReference)}`;

    const { error: ledgerError } = await admin.from("payments").insert({
      user_id: user.id,
      listing_id: listing.id,
      client_reference: clientReference,
      amount: PRICE,
      currency: "GHS",
      payment_status: "pending",
    });
    if (ledgerError) throw ledgerError;

    const accountNumber = Deno.env.get("HUBTEL_ACCOUNT_NUMBER");
    const apiId = Deno.env.get("HUBTEL_API_ID");
    const apiKey = Deno.env.get("HUBTEL_API_KEY");
    if (!accountNumber || !apiId || !apiKey) {
      await admin.from("payments").update({ payment_status: "failed" }).eq("client_reference", clientReference);
      return json({ error: "Payment gateway is not configured" }, 503);
    }

    const basic = btoa(`${apiId}:${apiKey}`);
    const payload = {
      InvoiceId: clientReference,
      TotalAmount: PRICE,
      Description: `Featured listing for ${DAYS} days - ${String(listing.title || "TrotroMall listing").slice(0, 100)}`,
      CustomerName: user.user_metadata?.full_name || user.email || "TrotroMall customer",
      CustomerEmail: user.email || undefined,
      PrimaryCallbackUrl: callbackUrl,
      ReturnUrl: returnUrl,
      CancellationUrl: cancellationUrl,
      Logo: `${SITE_URL}/assets/images/logo.png`,
      merchantAccountNumber: accountNumber,
      clientReference,
    };

    const gatewayResponse = await fetch(HUBTEL_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const gatewayJson = await gatewayResponse.json().catch(() => ({}));
    if (!gatewayResponse.ok) {
      await admin.from("payments").update({ payment_status: "failed" }).eq("client_reference", clientReference);
      return json({ error: "Hubtel checkout setup failed", details: gatewayJson?.message || gatewayJson?.ResponseMessage || "Gateway error" }, 502);
    }

    const checkoutUrl = gatewayJson?.data?.checkoutUrl || gatewayJson?.data?.CheckoutUrl || gatewayJson?.Data?.CheckoutUrl;
    const hubtelTransactionId = gatewayJson?.data?.transactionId || gatewayJson?.data?.TransactionId || null;
    if (!checkoutUrl) {
      await admin.from("payments").update({ payment_status: "failed", hubtel_transaction_id: hubtelTransactionId }).eq("client_reference", clientReference);
      return json({ error: "Hubtel did not return a checkout URL" }, 502);
    }

    if (hubtelTransactionId) {
      await admin.from("payments").update({ hubtel_transaction_id: hubtelTransactionId }).eq("client_reference", clientReference);
    }

    return json({ checkoutUrl, clientReference, amount: PRICE, days: DAYS });
  } catch (error) {
    console.error("initiate-hubtel-payment", error);
    return json({ error: "Unable to start payment" }, 500);
  }
});
