import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getEvmOpsWallet, getEvmOpsBalance, getSupportedEvmNetworks } from "../_shared/evm-ops-wallet.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify admin authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify admin role
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse optional network parameter
    const url = new URL(req.url);
    const network = url.searchParams.get('network') || 'POLYGON';

    console.log(`[get-evm-ops-wallet-info] Fetching wallet info for ${network}`);

    // Check if EVM_OPS_PRIVATE_KEY is configured
    const privateKey = Deno.env.get('EVM_OPS_PRIVATE_KEY');
    if (!privateKey) {
      return new Response(JSON.stringify({
        configured: false,
        error: 'EVM_OPS_PRIVATE_KEY not configured',
        supported_networks: getSupportedEvmNetworks(),
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get wallet info
    const wallet = getEvmOpsWallet(network);
    const balance = await getEvmOpsBalance(network);

    console.log(`[get-evm-ops-wallet-info] Address: ${wallet.address}, Balance: ${balance}`);

    return new Response(JSON.stringify({
      configured: true,
      network: wallet.network,
      chain_id: wallet.chainId,
      address: wallet.address,
      balance: balance,
      balance_display: `${parseFloat(balance).toFixed(4)} ${network === 'POLYGON' ? 'MATIC' : network === 'BSC' ? 'BNB' : 'ETH'}`,
      supported_networks: getSupportedEvmNetworks(),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[get-evm-ops-wallet-info] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
