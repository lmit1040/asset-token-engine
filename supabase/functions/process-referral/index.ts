import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { referralCode, action } = await req.json();

    if (action === "signup") {
      // Process signup with referral code
      if (!referralCode) {
        return new Response(JSON.stringify({ error: "Referral code is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Find the referral code
      const { data: codeData, error: codeError } = await supabase
        .from("referral_codes")
        .select("*")
        .eq("code", referralCode.toUpperCase())
        .eq("is_active", true)
        .single();

      if (codeError || !codeData) {
        return new Response(JSON.stringify({ error: "Invalid referral code" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Can't refer yourself
      if (codeData.user_id === user.id) {
        return new Response(JSON.stringify({ error: "Cannot use your own referral code" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check if already referred
      const { data: existingReferral } = await supabase
        .from("referrals")
        .select("id")
        .eq("referred_id", user.id)
        .single();

      if (existingReferral) {
        return new Response(JSON.stringify({ error: "Already referred by someone" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get signup reward config
      const { data: rewardConfig } = await supabase
        .from("reward_configurations")
        .select("mxg_amount")
        .eq("reward_type", "referral_signup")
        .eq("is_active", true)
        .single();

      const signupReward = rewardConfig?.mxg_amount || 25;

      // Create referral record
      const { error: referralError } = await supabase
        .from("referrals")
        .insert({
          referrer_id: codeData.user_id,
          referred_id: user.id,
          referral_code_id: codeData.id,
        });

      if (referralError) {
        console.error("Error creating referral:", referralError);
        return new Response(JSON.stringify({ error: "Failed to process referral" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Update uses count
      await supabase
        .from("referral_codes")
        .update({ uses_count: codeData.uses_count + 1 })
        .eq("id", codeData.id);

      // Create pending reward for referrer
      await supabase
        .from("activity_rewards")
        .insert({
          user_id: codeData.user_id,
          reward_type: "referral_signup",
          action_type: "referred_user_signup",
          entity_id: user.id,
          mxg_amount: signupReward,
          status: "pending",
        });

      return new Response(JSON.stringify({ 
        success: true, 
        message: "Referral processed successfully"
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } else if (action === "onboarding_complete") {
      // Process onboarding completion
      const { data: referral } = await supabase
        .from("referrals")
        .select("*, referral_codes(user_id)")
        .eq("referred_id", user.id)
        .eq("onboarding_completed", false)
        .single();

      if (!referral) {
        return new Response(JSON.stringify({ message: "No pending referral found" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get onboarding reward config
      const { data: rewardConfig } = await supabase
        .from("reward_configurations")
        .select("mxg_amount")
        .eq("reward_type", "referral_onboarding")
        .eq("is_active", true)
        .single();

      const onboardingReward = rewardConfig?.mxg_amount || 100;

      // Mark referral as completed
      await supabase
        .from("referrals")
        .update({ 
          onboarding_completed: true,
          reward_amount: onboardingReward 
        })
        .eq("id", referral.id);

      // Create pending reward for referrer
      await supabase
        .from("activity_rewards")
        .insert({
          user_id: referral.referrer_id,
          reward_type: "referral_onboarding",
          action_type: "referred_user_onboarding",
          entity_id: user.id,
          mxg_amount: onboardingReward,
          status: "pending",
        });

      return new Response(JSON.stringify({ 
        success: true, 
        message: "Onboarding reward created for referrer"
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    console.error("Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
