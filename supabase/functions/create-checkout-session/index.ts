// supabase/functions/create-checkout-session/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getStripeClient } from "../_shared/stripe-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Body = {
  fee_id?: string;               // use fee_catalog
  purpose: string;               // ASSET_SUBMISSION | TOKEN_IMPORT | MEMBERSHIP | TRUST_INVOICE | ...
  related_table?: string;
  related_id?: string;
  quantity?: number;             // optional, default 1
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // User-authenticated client for auth check
    const supabase = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: req.headers.get("Authorization")! } },
    });

    // Service role client for reading MXU balances
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData?.user) {
      return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    }
    const user = authData.user;

    const body = (await req.json()) as Body;
    const qty = Math.max(1, body.quantity ?? 1);

    // 1) Look up price server-side (never trust client)
    let amountCents = 0;
    let currency = "usd";
    let name = body.purpose;

    if (body.fee_id) {
      const { data: fee, error: feeErr } = await supabase
        .from("fee_catalog")
        .select("id, fee_key, amount_cents, currency")
        .eq("id", body.fee_id)
        .single();

      if (feeErr || !fee) {
        return new Response("Invalid fee", { status: 400, headers: corsHeaders });
      }
      amountCents = fee.amount_cents * qty;
      currency = (fee.currency || "usd").toLowerCase();
      name = fee.fee_key;
    } else {
      return new Response("fee_id required", { status: 400, headers: corsHeaders });
    }

    const originalAmountCents = amountCents;

    // 2) Calculate MXU discount
    let discountPercent = 0;
    let discountTier: string | null = null;

    // Get MXU token definition
    const { data: mxuToken } = await supabaseAdmin
      .from("token_definitions")
      .select("id")
      .eq("token_symbol", "MXU")
      .maybeSingle();

    if (mxuToken?.id) {
      // Get user's MXU balance
      const { data: holding } = await supabaseAdmin
        .from("user_token_holdings")
        .select("balance")
        .eq("user_id", user.id)
        .eq("token_definition_id", mxuToken.id)
        .maybeSingle();

      const mxuBalance = holding?.balance || 0;

      if (mxuBalance > 0) {
        // Get applicable discount tier (highest tier where user meets min_balance)
        const { data: tier } = await supabaseAdmin
          .from("fee_discount_tiers")
          .select("tier_name, discount_percentage")
          .eq("token_definition_id", mxuToken.id)
          .lte("min_balance", mxuBalance)
          .order("min_balance", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (tier) {
          discountPercent = tier.discount_percentage;
          discountTier = tier.tier_name;
          console.log(`[checkout] User ${user.id} qualifies for ${discountTier} tier (${discountPercent}% discount) with ${mxuBalance} MXU`);
        }
      }
    }

    // Apply discount
    if (discountPercent > 0) {
      amountCents = Math.round(amountCents * (1 - discountPercent / 100));
      console.log(`[checkout] Discount applied: $${originalAmountCents / 100} -> $${amountCents / 100} (${discountPercent}% off)`);
    }

    const { stripe } = await getStripeClient();

    // 3) Create Checkout Session
    const productDescription = discountPercent > 0
      ? `${discountPercent}% MXU ${discountTier} discount applied (was $${(originalAmountCents / 100).toFixed(2)})`
      : undefined;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      client_reference_id: user.id,
      customer_email: user.email ?? undefined,
      line_items: [
        {
          price_data: {
            currency,
            product_data: { 
              name,
              description: productDescription,
            },
            unit_amount: Math.max(0, Math.round(amountCents / qty)),
          },
          quantity: qty,
        },
      ],
      success_url: `${req.headers.get("origin")}/payments/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.get("origin")}/payments/cancel`,
      metadata: {
        purpose: body.purpose,
        related_table: body.related_table ?? "",
        related_id: body.related_id ?? "",
        fee_id: body.fee_id ?? "",
        user_id: user.id,
        original_amount_cents: originalAmountCents.toString(),
        discount_percentage: discountPercent.toString(),
        discount_tier: discountTier || "",
      },
    });

    // 4) Record as pending
    const { error: payErr } = await supabaseAdmin.from("payments").insert({
      user_id: user.id,
      purpose: body.purpose,
      related_table: body.related_table ?? null,
      related_id: body.related_id ?? null,
      amount_cents: amountCents,
      original_amount_cents: originalAmountCents,
      discount_percentage: discountPercent,
      discount_tier: discountTier,
      currency,
      stripe_checkout_session_id: session.id,
      status: "pending",
      metadata: {
        fee_id: body.fee_id ?? null,
        quantity: qty,
      },
    });

    if (payErr) {
      console.error("[checkout] DB insert error:", payErr);
      return new Response(`DB error: ${payErr.message}`, { status: 500, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ checkout_url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "unknown";
    console.error("[checkout] Error:", e);
    return new Response(`Error: ${message}`, { status: 500, headers: corsHeaders });
  }
});
