import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Thresholds for triggering refill requests
const SOLANA_MIN_BALANCE_SOL = 0.05;
const EVM_MIN_BALANCE_NATIVE = 0.01;

interface FeePayer {
  id: string;
  public_key: string;
  label: string;
  balance_sol?: number;
  balance_native?: number;
  is_active: boolean;
  network?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify admin access
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check admin role
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

    console.log('[wallet-auto-refill] Starting wallet balance check...');

    const results = {
      solana_checked: 0,
      solana_low: 0,
      evm_checked: 0,
      evm_low: 0,
      requests_created: 0,
      errors: [] as string[],
    };

    // Check Solana fee payers
    const { data: solanaFeePayers, error: solanaError } = await supabase
      .from('fee_payer_keys')
      .select('id, public_key, label, balance_sol, is_active')
      .eq('is_active', true);

    if (solanaError) {
      console.error('[wallet-auto-refill] Error fetching Solana fee payers:', solanaError);
      results.errors.push(`Solana fee payers fetch error: ${solanaError.message}`);
    } else if (solanaFeePayers) {
      results.solana_checked = solanaFeePayers.length;
      
      for (const fp of solanaFeePayers as FeePayer[]) {
        const balance = fp.balance_sol || 0;
        
        if (balance < SOLANA_MIN_BALANCE_SOL) {
          results.solana_low++;
          
          // Check if there's already a pending request for this wallet
          const { data: existingRequest } = await supabase
            .from('wallet_refill_requests')
            .select('id')
            .eq('wallet_address', fp.public_key)
            .eq('status', 'PENDING')
            .maybeSingle();
          
          if (!existingRequest) {
            const { error: insertError } = await supabase
              .from('wallet_refill_requests')
              .insert({
                wallet_type: 'FEE_PAYER',
                wallet_address: fp.public_key,
                chain: 'SOLANA',
                reason: 'FEE_PAYER_LOW_BALANCE',
                required_amount_native: Math.floor((SOLANA_MIN_BALANCE_SOL * 2 - balance) * 1e9),
                status: 'PENDING',
              });
            
            if (insertError) {
              results.errors.push(`Failed to create request for ${fp.label}: ${insertError.message}`);
            } else {
              results.requests_created++;
              console.log(`[wallet-auto-refill] Created refill request for Solana fee payer: ${fp.label}`);
            }
          }
        }
      }
    }

    // Check EVM fee payers
    const { data: evmFeePayers, error: evmError } = await supabase
      .from('evm_fee_payer_keys')
      .select('id, public_key, label, balance_native, is_active, network')
      .eq('is_active', true);

    if (evmError) {
      console.error('[wallet-auto-refill] Error fetching EVM fee payers:', evmError);
      results.errors.push(`EVM fee payers fetch error: ${evmError.message}`);
    } else if (evmFeePayers) {
      results.evm_checked = evmFeePayers.length;
      
      for (const fp of evmFeePayers as FeePayer[]) {
        const balance = fp.balance_native || 0;
        
        if (balance < EVM_MIN_BALANCE_NATIVE) {
          results.evm_low++;
          
          // Check if there's already a pending request for this wallet
          const { data: existingRequest } = await supabase
            .from('wallet_refill_requests')
            .select('id')
            .eq('wallet_address', fp.public_key)
            .eq('chain', fp.network || 'POLYGON')
            .eq('status', 'PENDING')
            .maybeSingle();
          
          if (!existingRequest) {
            const { error: insertError } = await supabase
              .from('wallet_refill_requests')
              .insert({
                wallet_type: 'FEE_PAYER',
                wallet_address: fp.public_key,
                chain: fp.network || 'POLYGON',
                reason: 'FEE_PAYER_LOW_BALANCE',
                required_amount_native: Math.floor((EVM_MIN_BALANCE_NATIVE * 10 - balance) * 1e18),
                status: 'PENDING',
              });
            
            if (insertError) {
              results.errors.push(`Failed to create request for ${fp.label}: ${insertError.message}`);
            } else {
              results.requests_created++;
              console.log(`[wallet-auto-refill] Created refill request for EVM fee payer: ${fp.label} (${fp.network})`);
            }
          }
        }
      }
    }

    console.log('[wallet-auto-refill] Complete:', results);

    return new Response(JSON.stringify({
      success: true,
      ...results,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[wallet-auto-refill] Error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
