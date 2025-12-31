import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function generateCode(length: number = 8): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

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

    // Check if user already has a referral code
    const { data: existingCode } = await supabase
      .from("referral_codes")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .single();

    if (existingCode) {
      return new Response(JSON.stringify({ 
        code: existingCode.code,
        uses_count: existingCode.uses_count,
        created_at: existingCode.created_at
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate unique code
    let code = generateCode();
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      const { data: existingWithCode } = await supabase
        .from("referral_codes")
        .select("id")
        .eq("code", code)
        .single();

      if (!existingWithCode) break;
      
      code = generateCode();
      attempts++;
    }

    if (attempts >= maxAttempts) {
      return new Response(JSON.stringify({ error: "Failed to generate unique code" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Insert new referral code
    const { data: newCode, error: insertError } = await supabase
      .from("referral_codes")
      .insert({
        user_id: user.id,
        code: code,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error creating referral code:", insertError);
      return new Response(JSON.stringify({ error: "Failed to create referral code" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ 
      code: newCode.code,
      uses_count: 0,
      created_at: newCode.created_at
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
