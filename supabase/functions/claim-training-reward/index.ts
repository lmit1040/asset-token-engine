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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from auth header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      throw new Error("Unauthorized");
    }

    const { courseId } = await req.json();

    if (!courseId) {
      throw new Error("Course ID is required");
    }

    // Check if user has completed the course
    const { data: progress, error: progressError } = await supabase
      .from("user_course_progress")
      .select("*")
      .eq("user_id", user.id)
      .eq("course_id", courseId)
      .single();

    if (progressError || !progress) {
      throw new Error("Course progress not found");
    }

    if (!progress.completed_at) {
      throw new Error("Course not completed");
    }

    if (progress.reward_claimed) {
      throw new Error("Reward already claimed");
    }

    // Get course reward amount
    const { data: course, error: courseError } = await supabase
      .from("training_courses")
      .select("mxg_reward_amount, title")
      .eq("id", courseId)
      .single();

    if (courseError || !course) {
      throw new Error("Course not found");
    }

    if (!course.mxg_reward_amount || course.mxg_reward_amount <= 0) {
      throw new Error("No reward available for this course");
    }

    // Create activity reward record
    const { error: rewardError } = await supabase
      .from("activity_rewards")
      .insert({
        user_id: user.id,
        reward_type: "training_completion",
        action_type: "course_completed",
        entity_id: courseId,
        mxg_amount: course.mxg_reward_amount,
        status: "distributed",
        distributed_at: new Date().toISOString()
      });

    if (rewardError) {
      console.error("Error creating reward:", rewardError);
      throw new Error("Failed to create reward");
    }

    // Mark reward as claimed
    const { error: updateError } = await supabase
      .from("user_course_progress")
      .update({
        reward_claimed: true,
        reward_claimed_at: new Date().toISOString()
      })
      .eq("id", progress.id);

    if (updateError) {
      console.error("Error updating progress:", updateError);
      throw new Error("Failed to update progress");
    }

    // Log activity
    await supabase.from("activity_logs").insert({
      action_type: "training_reward_claimed",
      entity_type: "training_course",
      entity_id: courseId,
      entity_name: course.title,
      performed_by: user.id,
      details: {
        mxg_amount: course.mxg_reward_amount
      }
    });

    return new Response(
      JSON.stringify({
        success: true,
        mxgAmount: course.mxg_reward_amount,
        message: `Successfully claimed ${course.mxg_reward_amount} MXG`
      }),
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200 
      }
    );
  } catch (error: any) {
    console.error("Error claiming reward:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400 
      }
    );
  }
});
