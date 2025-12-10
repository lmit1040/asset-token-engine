import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Keypair } from "https://esm.sh/@solana/web3.js@1.87.6";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Decrypt function matching the encryption in generate-fee-payer
function decryptSecretKey(encryptedBase64: string, encryptionKey: string): Keypair {
  const encryptedBytes = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
  const keyBytes = new TextEncoder().encode(encryptionKey);
  
  const decrypted = new Uint8Array(encryptedBytes.length);
  for (let i = 0; i < encryptedBytes.length; i++) {
    decrypted[i] = encryptedBytes[i] ^ keyBytes[i % keyBytes.length];
  }
  
  return Keypair.fromSecretKey(decrypted);
}

/**
 * Internal edge function to get an active fee payer keypair
 * This function is meant to be called by other edge functions, not directly by clients
 * 
 * Request body options:
 * - fee_payer_id: specific fee payer ID to use (optional)
 * - prefer_least_used: if true, selects the least-used active fee payer (default: true)
 * 
 * Returns:
 * - public_key: the fee payer's public key
 * - secret_key_array: the decrypted secret key as a JSON array (for use with Keypair.fromSecretKey)
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const encryptionKey = Deno.env.get('FEE_PAYER_ENCRYPTION_KEY');

    if (!encryptionKey) {
      console.error('FEE_PAYER_ENCRYPTION_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'Encryption key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseService = createClient(supabaseUrl, supabaseServiceKey);

    // Check if the token is the service role key (internal function call)
    const isServiceRoleCall = token === supabaseServiceKey;

    if (!isServiceRoleCall) {
      // Verify caller is admin user
      const supabaseAuth = createClient(supabaseUrl, supabaseServiceKey, {
        global: { headers: { Authorization: authHeader } }
      });

      const { data: { user }, error: userError } = await supabaseAuth.auth.getUser(token);
      if (userError || !user) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: roleData, error: roleError } = await supabaseService
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .single();

      if (roleError || !roleData) {
        return new Response(
          JSON.stringify({ error: 'Admin access required' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    console.log('Access granted:', isServiceRoleCall ? 'service-role' : 'admin-user');

    // Parse request options
    let feePayerId: string | null = null;
    let preferLeastUsed = true;

    try {
      const body = await req.json();
      feePayerId = body.fee_payer_id || null;
      preferLeastUsed = body.prefer_least_used !== false;
    } catch {
      // Use defaults
    }

    // Fetch fee payer
    let query = supabaseService
      .from('fee_payer_keys')
      .select('*')
      .eq('is_active', true)
      .not('secret_key_encrypted', 'is', null);

    if (feePayerId) {
      query = query.eq('id', feePayerId);
    } else if (preferLeastUsed) {
      query = query.order('usage_count', { ascending: true }).limit(1);
    } else {
      query = query.limit(1);
    }

    const { data: feePayers, error: fetchError } = await query;

    if (fetchError) {
      console.error('Failed to fetch fee payers:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch fee payers' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!feePayers || feePayers.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No active generated fee payers available' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const feePayer = feePayers[0];
    
    // Decrypt the secret key
    const keypair = decryptSecretKey(feePayer.secret_key_encrypted, encryptionKey);
    
    // Update usage count and last_used_at
    await supabaseService
      .from('fee_payer_keys')
      .update({ 
        usage_count: (feePayer.usage_count || 0) + 1,
        last_used_at: new Date().toISOString()
      })
      .eq('id', feePayer.id);

    console.log(`Returning fee payer keypair: ${feePayer.public_key} (usage: ${feePayer.usage_count + 1})`);

    return new Response(
      JSON.stringify({
        success: true,
        fee_payer_id: feePayer.id,
        public_key: feePayer.public_key,
        secret_key_array: Array.from(keypair.secretKey),
        label: feePayer.label
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error getting fee payer keypair:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
