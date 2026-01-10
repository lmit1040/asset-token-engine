import { supabase } from "@/lib/supabase";

type StartPaymentParams = {
  fee_id: string;
  purpose: string;
  related_table?: string;
  related_id?: string;
  quantity?: number;
};

export async function startStripeCheckout(params: StartPaymentParams) {
  const { data, error } = await supabase.functions.invoke(
    "create-checkout-session",
    { body: params }
  );

  if (error) {
    console.error("Stripe checkout error", error);
    throw new Error(error.message);
  }

  if (!data?.checkout_url) {
    throw new Error("No checkout URL returned");
  }

  window.location.href = data.checkout_url;
}
