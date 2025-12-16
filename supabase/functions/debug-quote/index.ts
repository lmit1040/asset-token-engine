import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getZeroXQuoteWithDetails, POLYGON_CANONICAL_TOKENS, formatAmountWithDecimals } from "../_shared/zerox-client.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Auth check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const { data: roleData } = await supabase.from('user_roles').select('role').eq('user_id', user.id).single();
    if (roleData?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Admin only' }), { status: 403, headers: corsHeaders });
    }

    const body = await req.json();
    const { network, sellToken, buyToken, sellAmount, leg } = body;

    if (!network || !sellToken || !buyToken || !sellAmount) {
      return new Response(JSON.stringify({ error: 'Missing required params: network, sellToken, buyToken, sellAmount' }), 
        { status: 400, headers: corsHeaders });
    }

    console.log(`[debug-quote] Leg ${leg || '?'}: ${sellToken} -> ${buyToken}, amount=${sellAmount}, network=${network}`);

    const result = await getZeroXQuoteWithDetails({
      network,
      sellToken,
      buyToken,
      sellAmount,
    });

    return new Response(JSON.stringify({
      success: result.quote !== null,
      leg,
      network,
      sellToken,
      buyToken,
      sellAmount,
      sellAmountFormatted: formatAmountWithDecimals(sellAmount, 6),
      quote: result.quote,
      error: result.error,
      errorCode: result.errorCode,
      rawResponse: result.rawResponse,
      requestParams: result.requestParams,
      retryAttempts: result.retryAttempts,
      usedRelaxedConstraints: result.usedRelaxedConstraints,
      canonicalTokens: POLYGON_CANONICAL_TOKENS,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('[debug-quote] Error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Internal error' }), 
      { status: 500, headers: corsHeaders });
  }
});
