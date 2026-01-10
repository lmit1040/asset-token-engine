// supabase/functions/stripe-webhook/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getStripeClient } from "../_shared/stripe-client.ts";

Deno.serve(async (req) => {
  try {
    const stripe = await getStripeClient();

    const sig = req.headers.get("stripe-signature");
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    if (!sig || !webhookSecret) return new Response("Missing webhook secret/signature", { status: 400 });

    const rawBody = await req.text();

    let event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } catch (_err) {
      return new Response("Webhook signature verification failed", { status: 400 });
    }

    // Use service role key for DB writes (webhooks are server-to-server)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRole);

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as any;

      const sessionId = session.id as string;
      const paymentIntent = session.payment_intent as string | null;

      // 1) Mark payment as paid
      const { data: updated, error: upErr } = await admin
        .from("payments")
        .update({
          status: "paid",
          stripe_payment_intent_id: paymentIntent ?? null,
          stripe_customer_id: session.customer ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("stripe_checkout_session_id", sessionId)
        .select("*")
        .single();

      if (upErr || !updated) return new Response("Payment record not found", { status: 404 });

      // 2) Unlock logic (ALL)
      // You decide what "paid" enables. Here are the patterns:
      const purpose = session.metadata?.purpose || updated.purpose;
      const relatedTable = session.metadata?.related_table || updated.related_table;
      const relatedId = session.metadata?.related_id || updated.related_id;

      // Example unlocks (adjust to your schema):
      // - If purpose is TRUST_INVOICE -> update trust_invoices
      if (purpose === "TRUST_INVOICE" && relatedId) {
        await admin
          .from("trust_invoices")
          .update({ status: "paid", stripe_invoice_id: session.invoice ?? null })
          .eq("id", relatedId);
      }

      // - If purpose is TOKEN_IMPORT or TOKEN_DEPLOY -> update token_definitions flags
      if ((purpose === "TOKEN_IMPORT" || purpose === "TOKEN_DEPLOY") && relatedId) {
        await admin
          .from("token_definitions")
          .update({ /* e.g. paid_gate_passed: true */ })
          .eq("id", relatedId);
      }

      // - If purpose is ASSET_SUBMISSION -> update assets/workflow state (if you have a state column)
      // await admin.from("assets").update({ status: "ready_for_review" }).eq("id", relatedId);

      return new Response("ok", { status: 200 });
    }

    return new Response("ignored", { status: 200 });
  } catch (e) {
    return new Response(`Error: ${e?.message ?? "unknown"}`, { status: 500 });
  }
});
