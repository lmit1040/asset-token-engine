import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Connection, Keypair, LAMPORTS_PER_SOL } from "https://esm.sh/@solana/web3.js@1.87.6";

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
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabaseAuth = createClient(supabaseUrl, supabaseServiceKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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

    // Get OPS wallet keypair
    const opsWalletSecretKey = Deno.env.get('OPS_WALLET_SECRET_KEY');
    if (!opsWalletSecretKey) {
      return new Response(JSON.stringify({ error: 'OPS_WALLET_SECRET_KEY not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let opsKeypair: Keypair;
    try {
      const secretKeyArray = JSON.parse(opsWalletSecretKey);
      opsKeypair = Keypair.fromSecretKey(Uint8Array.from(secretKeyArray));
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Invalid OPS_WALLET_SECRET_KEY format' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const publicKey = opsKeypair.publicKey.toBase58();

    // Fetch balance from Solana Devnet
    const rpcUrl = Deno.env.get('SOLANA_DEVNET_RPC_URL') || 'https://api.devnet.solana.com';
    const connection = new Connection(rpcUrl, 'confirmed');
    
    let balanceSol = 0;
    try {
      const balanceLamports = await connection.getBalance(opsKeypair.publicKey);
      balanceSol = balanceLamports / LAMPORTS_PER_SOL;
    } catch (e) {
      console.error('[get-ops-wallet-info] Failed to fetch balance:', e);
    }

    console.log(`[get-ops-wallet-info] OPS wallet: ${publicKey}, balance: ${balanceSol} SOL`);

    return new Response(JSON.stringify({
      publicKey,
      balanceSol,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[get-ops-wallet-info] Error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
