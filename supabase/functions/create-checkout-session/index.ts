// supabase/functions/create-checkout-session/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getStripeClient } from "../_shared/stripe-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Body = {
  fee_id?: string; // fee_catalog.id
  purpose?: string; // ASSET_SUBMISSION | TOKEN_IMPORT | TOKEN_DEPLOY | TRUST_INVOICE | ASSET_ONBOARDING | MEMBERSHIP | ...
  related_table?: string;
  related_id?: string;
  quantity?: number; // default 1
};

function getSiteUrl(req: Request): string {
  return (
    req.headers.get("origin") ||
    Deno.env.get("SITE_URL") ||
    Deno.env.get("PUBLIC_SITE_URL") ||
    "http://localhost:5173"
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Authenticated client (user context)
    const supabase = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: req.headers.get("Authorization")! } },
    });

    // Service role client (for lookups not allowed by RLS)
    const admin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const user = authData.user;

    const body = (await req.json()) as Body;

    if (!body.fee_id) {
      return new Response(JSON.stringify({ error: "fee_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const qty = Math.max(1, Number.isFinite(body.quantity) ? Math.floor(body.quantity!) : 1);

    // 1) Look up the fee server-side
    const { data: fee, error: feeErr } = await admin
      .from("fee_catalog")
      .select("id, fee_key, amount_cents, description")
      .eq("id", body.fee_id)
      .eq("enabled", true)
      .single();

    if (feeErr || !fee) {
      console.error("[checkout] fee lookup error:", feeErr, "fee_id:", body.fee_id);
      return new Response(JSON.stringify({ error: "Invalid fee" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const currency = "usd";

    const originalAmountCents = (fee.amount_cents ?? 0) * qty;

    // 2) Calculate MXU discount (check fee_discount_tiers)
    let discountPercent = 0;
    let discountTierId: string | null = null;

    // Check if user has MXU holdings for potential discount
    const { data: holding } = await admin
      .from("user_token_holdings")
      .select("quantity")
      .eq("user_id", user.id)
      .eq("symbol", "MXU")
      .limit(1)
      .maybeSingle();

    const mxuAmount = holding?.quantity ?? 0;

    if (mxuAmount > 0) {
      // fee_discount_tiers: pick best tier where min_balance <= mxuAmount
      const { data: tier } = await admin
        .from("fee_discount_tiers")
        .select("id, discount_percentage, min_balance")
        .lte("min_balance", mxuAmount)
        .order("min_balance", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (tier) {
        discountPercent = tier.discount_percentage ?? 0;
        discountTierId = tier.id ?? null;
      }
    }

    const discountAmountCents = Math.floor((originalAmountCents * discountPercent) / 100);
    const finalAmountCents = Math.max(0, originalAmountCents - discountAmountCents);

    const purpose = body.purpose ?? fee.fee_key;

    // 3) Create Stripe checkout session
    const { stripe } = await getStripeClient();

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: `${getSiteUrl(req)}/payments/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${getSiteUrl(req)}/payments/cancel`,
      customer_email: user.email ?? undefined,
      line_items: [
        {
          price_data: {
            currency,
            product_data: {
              name: fee.description || fee.fee_key,
              description: fee.description || undefined,
            },
            unit_amount: finalAmountCents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        user_id: user.id,
        fee_id: fee.id,
        fee_key: fee.fee_key,
        purpose,
        related_table: body.related_table ?? "",
        related_id: body.related_id ?? "",
      },
    });

    // 4) Insert payment record (MATCHES your payments table)
    const { error: payErr } = await admin.from("payments").insert({
      user_id: user.id,
      purpose,
      related_table: body.related_table ?? null,
      related_id: body.related_id ?? null,
      amount_cents: finalAmountCents,
      currency,
      stripe_checkout_session_id: session.id,
      status: "pending",
      metadata: {
        fee_id: fee.id,
        fee_key: fee.fee_key,
        quantity: qty,
        original_amount_cents: originalAmountCents,
        discount_percent: discountPercent,
        discount_tier_id: discountTierId,
      },
    });

    if (payErr) {
      console.error("[checkout] payments insert error:", payErr);
      return new Response(JSON.stringify({ error: payErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ checkout_url: session.url }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "unknown";
    console.error("[checkout] Error:", e);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
