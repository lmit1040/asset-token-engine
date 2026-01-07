import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface StripeClientResult {
  stripe: Stripe;
  isTestMode: boolean;
}

/**
 * Get the appropriate Stripe client based on the system's stripe_test_mode setting.
 * Returns the client and whether it's in test mode.
 */
export async function getStripeClient(): Promise<StripeClientResult> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Check system settings for test mode
  const { data: settings, error } = await supabase
    .from("system_settings")
    .select("stripe_test_mode")
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[stripe-client] Error fetching system settings:", error);
  }

  // Default to test mode for safety
  const isTestMode = settings?.stripe_test_mode ?? true;

  // Get appropriate key based on mode
  const stripeKey = isTestMode
    ? Deno.env.get("STRIPE_TEST_SECRET_KEY")
    : Deno.env.get("STRIPE_SECRET_KEY");

  if (!stripeKey) {
    const keyName = isTestMode ? "STRIPE_TEST_SECRET_KEY" : "STRIPE_SECRET_KEY";
    throw new Error(`${keyName} is not configured`);
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

  console.log(`[stripe-client] Initialized Stripe client in ${isTestMode ? 'TEST' : 'LIVE'} mode`);

  return { stripe, isTestMode };
}

/**
 * Check if the system is in Stripe test mode.
 */
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

  // Default to test mode for safety
  return settings?.stripe_test_mode ?? true;
}
