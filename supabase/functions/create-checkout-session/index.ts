// supabase/functions/create-checkout-session/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@15.12.0?target=deno";
import { getStripeClient } from "../_shared/stripe-client.ts";

type Body = {
  fee_id?: string;               // use fee_catalog
  purpose: string;               // ASSET_SUBMISSION | TOKEN_IMPORT | MEMBERSHIP | TRUST_INVOICE | ...
  related_table?: string;
  related_id?: string;
  quantity?: number;             // optional, default 1
};

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: req.headers.get("Authorization")! } },
    });

    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData?.user) return new Response("Unauthorized", { status: 401 });
    const user = authData.user;

    const body = (await req.json()) as Body;
    const qty = Math.max(1, body.quantity ?? 1);

    // 1) Look up price server-side (never trust client)
    // If you want: fee_catalog table controls pricing.
    let amountCents = 0;
    let currency = "usd";
    let name = body.purpose;

    if (body.fee_id) {
      const { data: fee, error: feeErr } = await supabase
        .from("fee_catalog")
        .select("id, fee_name, amount_cents, currency")
        .eq("id", body.fee_id)
        .single();

      if (feeErr || !fee) return new Response("Invalid fee", { status: 400 });
      amountCents = fee.amount_cents * qty;
      currency = (fee.currency || "usd").toLowerCase();
      name = fee.fee_name;
    } else {
      // fallback: require fee_id in MVP
      return new Response("fee_id required", { status: 400 });
    }

    const stripe = await getStripeClient();

    // 2) Create Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      client_reference_id: user.id,
      customer_email: user.email ?? undefined,
      line_items: [
        {
          price_data: {
            currency,
            product_data: { name },
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
      },
    });

    // 3) Record as pending
    const { error: payErr } = await supabase.from("payments").insert({
      user_id: user.id,
      purpose: body.purpose,
      related_table: body.related_table ?? null,
      related_id: body.related_id ?? null,
      amount_cents: amountCents,
      currency,
      stripe_checkout_session_id: session.id,
      status: "pending",
      metadata: {
        fee_id: body.fee_id ?? null,
        quantity: qty,
      },
    });

    if (payErr) return new Response(`DB error: ${payErr.message}`, { status: 500 });

    return Response.json({ checkout_url: session.url });
  } catch (e) {
    return new Response(`Error: ${e?.message ?? "unknown"}`, { status: 500 });
  }
});
