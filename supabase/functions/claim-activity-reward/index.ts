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

    const { rewardId } = await req.json();

    if (!rewardId) {
      return new Response(JSON.stringify({ error: "Reward ID is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch the pending reward
    const { data: reward, error: rewardError } = await supabase
      .from("activity_rewards")
      .select("*")
      .eq("id", rewardId)
      .eq("user_id", user.id)
      .eq("status", "pending")
      .single();

    if (rewardError || !reward) {
      return new Response(JSON.stringify({ error: "Reward not found or already claimed" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get MXG token definition
    const { data: mxgToken, error: tokenError } = await supabase
      .from("token_definitions")
      .select("id")
      .eq("token_symbol", "MXG")
      .single();

    if (tokenError || !mxgToken) {
      return new Response(JSON.stringify({ error: "MXG token not found" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if user has an MXG holding record
    const { data: existingHolding } = await supabase
      .from("user_token_holdings")
      .select("*")
      .eq("user_id", user.id)
      .eq("token_definition_id", mxgToken.id)
      .single();

    if (existingHolding) {
      // Update existing holding
      const { error: updateError } = await supabase
        .from("user_token_holdings")
        .update({ balance: existingHolding.balance + reward.mxg_amount })
        .eq("id", existingHolding.id);

      if (updateError) {
        console.error("Error updating holding:", updateError);
        return new Response(JSON.stringify({ error: "Failed to update balance" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      // Create new holding
      const { error: insertError } = await supabase
        .from("user_token_holdings")
        .insert({
          user_id: user.id,
          token_definition_id: mxgToken.id,
          balance: reward.mxg_amount,
        });

      if (insertError) {
        console.error("Error creating holding:", insertError);
        return new Response(JSON.stringify({ error: "Failed to create holding" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Mark reward as claimed
    const { error: claimError } = await supabase
      .from("activity_rewards")
      .update({ 
        status: "claimed",
        distributed_at: new Date().toISOString()
      })
      .eq("id", rewardId);

    if (claimError) {
      console.error("Error claiming reward:", claimError);
      return new Response(JSON.stringify({ error: "Failed to claim reward" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ 
      success: true, 
      amount: reward.mxg_amount,
      message: `Successfully claimed ${reward.mxg_amount} MXG` 
    }), {
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
