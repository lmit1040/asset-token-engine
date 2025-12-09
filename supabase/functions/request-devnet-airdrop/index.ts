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

    const publicKey = opsKeypair.publicKey;

    // Connect to Solana Devnet and request airdrop
    const rpcUrl = Deno.env.get('SOLANA_DEVNET_RPC_URL') || 'https://api.devnet.solana.com';
    const connection = new Connection(rpcUrl, 'confirmed');
    
    console.log(`[request-devnet-airdrop] Requesting 1 SOL airdrop for ${publicKey.toBase58()}`);

    // Request 1 SOL airdrop (max allowed per request on devnet)
    const airdropAmount = 1 * LAMPORTS_PER_SOL;
    
    const signature = await connection.requestAirdrop(publicKey, airdropAmount);
    console.log(`[request-devnet-airdrop] Airdrop signature: ${signature}`);

    // Wait for confirmation
    const latestBlockhash = await connection.getLatestBlockhash();
    await connection.confirmTransaction({
      signature,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    });

    // Fetch new balance
    const newBalance = await connection.getBalance(publicKey);
    const newBalanceSol = newBalance / LAMPORTS_PER_SOL;

    console.log(`[request-devnet-airdrop] Airdrop confirmed. New balance: ${newBalanceSol} SOL`);

    return new Response(JSON.stringify({
      success: true,
      signature,
      amountSol: 1,
      newBalanceSol,
      publicKey: publicKey.toBase58(),
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[request-devnet-airdrop] Error:', error);
    
    // Handle rate limiting from devnet faucet
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const isRateLimited = errorMessage.includes('429') || errorMessage.includes('rate') || errorMessage.includes('limit');
    
    return new Response(JSON.stringify({ 
      error: isRateLimited 
        ? 'Devnet faucet rate limited. Please wait a few minutes and try again.' 
        : errorMessage 
    }), {
      status: isRateLimited ? 429 : 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
