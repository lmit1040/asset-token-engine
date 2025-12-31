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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Get all active stakes with their pool info
    const { data: stakes, error: stakesError } = await supabase
      .from("user_stakes")
      .select(`
        *,
        staking_pools (
          apy_percentage,
          token_definition_id
        )
      `)
      .eq("is_active", true);

    if (stakesError) {
      console.error("Error fetching stakes:", stakesError);
      return new Response(JSON.stringify({ error: "Failed to fetch stakes" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date();
    let processedCount = 0;
    let totalRewardsDistributed = 0;

    for (const stake of stakes || []) {
      const lastCalculation = new Date(stake.last_reward_calculation);
      const daysSinceLastCalc = (now.getTime() - lastCalculation.getTime()) / (1000 * 60 * 60 * 24);
      
      if (daysSinceLastCalc < 1) continue; // Only calculate once per day minimum

      const pool = stake.staking_pools;
      if (!pool) continue;

      // Calculate rewards: (staked_amount * APY% / 100) * (days / 365)
      const apy = pool.apy_percentage;
      const dailyRate = apy / 365 / 100;
      const reward = stake.staked_amount * dailyRate * daysSinceLastCalc;

      if (reward <= 0) continue;

      // Update stake with new rewards
      const { error: updateError } = await supabase
        .from("user_stakes")
        .update({
          rewards_earned: stake.rewards_earned + reward,
          last_reward_calculation: now.toISOString(),
        })
        .eq("id", stake.id);

      if (updateError) {
        console.error(`Error updating stake ${stake.id}:`, updateError);
        continue;
      }

      processedCount++;
      totalRewardsDistributed += reward;
    }

    return new Response(JSON.stringify({ 
      success: true,
      processed: processedCount,
      totalRewards: totalRewardsDistributed,
      message: `Processed ${processedCount} stakes, distributed ${totalRewardsDistributed.toFixed(4)} MXG in rewards`
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
