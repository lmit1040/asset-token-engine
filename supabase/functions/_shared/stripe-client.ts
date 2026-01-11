// supabase/functions/_shared/stripe-client.ts
import Stripe from "https://esm.sh/stripe@18.5.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface StripeClientResult {
  stripe: Stripe;
  isTestMode: boolean;
}

/**
 * Reads system_settings.stripe_test_mode and returns a Stripe client
 * using STRIPE_TEST_SECRET_KEY or STRIPE_SECRET_KEY.
 */
export async function getStripeClient(): Promise<StripeClientResult> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: settings, error } = await supabase
    .from("system_settings")
    .select("stripe_test_mode")
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[stripe-client] Error fetching system settings:", error);
  }

  const isTestMode = settings?.stripe_test_mode ?? true;

  const stripeKey = isTestMode
    ? Deno.env.get("STRIPE_TEST_SECRET_KEY")
    : Deno.env.get("STRIPE_SECRET_KEY");

  if (!stripeKey) {
    const keyName = isTestMode ? "STRIPE_TEST_SECRET_KEY" : "STRIPE_SECRET_KEY";
    throw new Error(`${keyName} is not configured`);
  }

  const stripe = new Stripe(stripeKey, {
    // Keep your API version pinned. If you want to change it later, do it intentionally.
    apiVersion: "2025-08-27.basil",
    httpClient: Stripe.createFetchHttpClient(),
  });

  console.log(
    `[stripe-client] Initialized Stripe client in ${isTestMode ? "TEST" : "LIVE"} mode`
  );

  return { stripe, isTestMode };
}

/** Convenience helper if you only need the mode flag */
export async function isStripeTestMode(): Promise<boolean> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: settings, error } = await supabase
    .from("system_settings")
    .select("stripe_test_mode")
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[stripe-client] Error fetching system settings:", error);
  }

  return settings?.stripe_test_mode ?? true;
}
