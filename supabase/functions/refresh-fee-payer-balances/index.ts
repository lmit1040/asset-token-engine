import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "https://esm.sh/@solana/web3.js@1.87.6";

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

    // Get all fee payers
    const { data: feePayers, error: fetchError } = await supabase
      .from('fee_payer_keys')
      .select('id, public_key');

    if (fetchError) {
      throw new Error(`Failed to fetch fee payers: ${fetchError.message}`);
    }

    if (!feePayers || feePayers.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No fee payers to update' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Connect to Solana Devnet
    const rpcUrl = Deno.env.get('SOLANA_DEVNET_RPC_URL') || 'https://api.devnet.solana.com';
    const connection = new Connection(rpcUrl, 'confirmed');

    console.log(`Refreshing balances for ${feePayers.length} fee payers...`);

    // Fetch balances for each fee payer
    const updates = await Promise.all(
      feePayers.map(async (fp) => {
        try {
          const pubkey = new PublicKey(fp.public_key);
          const balance = await connection.getBalance(pubkey);
          const balanceSol = balance / LAMPORTS_PER_SOL;

          console.log(`${fp.public_key.slice(0, 8)}...: ${balanceSol.toFixed(4)} SOL`);

          return {
            id: fp.id,
            balance_sol: balanceSol
          };
        } catch (error) {
          console.error(`Failed to get balance for ${fp.public_key}:`, error);
          return { id: fp.id, balance_sol: 0 };
        }
      })
    );

    // Update balances in database
    for (const update of updates) {
      const { error: updateError } = await supabase
        .from('fee_payer_keys')
        .update({ balance_sol: update.balance_sol })
        .eq('id', update.id);

      if (updateError) {
        console.error(`Failed to update balance for ${update.id}:`, updateError);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Updated balances for ${updates.length} fee payers`,
        balances: updates
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error refreshing balances:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
