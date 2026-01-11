// supabase/functions/stripe-webhook/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getStripeClient } from "../_shared/stripe-client.ts";

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const sig = req.headers.get("stripe-signature");
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    if (!sig || !webhookSecret) {
      return new Response("Missing webhook secret/signature", { status: 400 });
    }

    const rawBody = await req.text();
    const { stripe } = await getStripeClient();

    let event: any;
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } catch (err: any) {
      console.error("[stripe-webhook] Signature verification failed:", err?.message ?? err);
      return new Response("Invalid signature", { status: 400 });
    }

    // Only act on completed/successful checkout
    if (
      event.type !== "checkout.session.completed" &&
      event.type !== "checkout.session.async_payment_succeeded"
    ) {
      return new Response("ignored", { status: 200 });
    }

    const session = event.data.object as any;
    const sessionId = session.id as string | undefined;
    if (!sessionId) return new Response("Missing session id", { status: 400 });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRole);

    // 1) Mark payment as paid
    const { data: payment, error: payErr } = await admin
      .from("payments")
      .update({
        status: "paid",
        stripe_payment_intent_id: session.payment_intent ?? null,
        stripe_customer_id: session.customer ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("stripe_checkout_session_id", sessionId)
      .select("*")
      .single();

    if (payErr || !payment) {
      console.error("[stripe-webhook] Payment record update error:", payErr);
      return new Response("Payment record not found", { status: 404 });
    }

    // 2) Unlock / Gate logic
    const purpose = (session.metadata?.purpose || payment.purpose || "") as string;
    const relatedTable = (session.metadata?.related_table || payment.related_table || "") as string;
    const relatedId = (session.metadata?.related_id || payment.related_id || "") as string;

    try {
      // Asset submission payment -> mark submission paid
      // Your schema uses user_asset_submissions.payment_status
      if (purpose === "ASSET_SUBMISSION" && relatedId) {
        await admin
          .from("user_asset_submissions")
          .update({ payment_status: "paid" })
          .eq("id", relatedId);
      }

      // Token deploy payment -> allow deployment workflow
      // token_definitions.deployment_status enum: NOT_DEPLOYED | PENDING | DEPLOYED
      if (purpose === "TOKEN_DEPLOY" && relatedId) {
        await admin
          .from("token_definitions")
          .update({ deployment_status: "PENDING" })
          .eq("id", relatedId);
      }

      // Trust invoice payment -> mark invoice paid
      if (purpose === "TRUST_INVOICE" && relatedId) {
        await admin
          .from("trust_invoices")
          .update({ status: "paid", stripe_invoice_id: session.invoice ?? null })
          .eq("id", relatedId);
      }

      // Trust onboarding fee -> activate trust account
      if (purpose === "ASSET_ONBOARDING" && relatedTable === "trust_accounts" && relatedId) {
        await admin
          .from("trust_accounts")
          .update({ is_active: true, updated_at: new Date().toISOString() })
          .eq("id", relatedId);
      }

      // Token import fee (optional gate): if you want, you can mark a flag in metadata or notes
      // if (purpose === "TOKEN_IMPORT" && relatedId) { ... }

    } catch (unlockErr: any) {
      console.error("[stripe-webhook] Unlock logic error:", unlockErr?.message ?? unlockErr);
      // Still return 200 so Stripe doesn't retry forever.
    }

    return new Response("ok", { status: 200 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "unknown";
    console.error("[stripe-webhook] Error:", e);
    return new Response(`Error: ${message}`, { status: 500 });
  }
});
