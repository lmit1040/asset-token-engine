import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ethers } from "https://esm.sh/ethers@6.13.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// XOR-based encryption for private key storage
function encryptPrivateKey(privateKeyHex: string, encryptionKey: string): string {
  const keyBytes = new TextEncoder().encode(encryptionKey);
  const privateKeyBytes = new TextEncoder().encode(privateKeyHex);
  const encrypted = new Uint8Array(privateKeyBytes.length);
  
  for (let i = 0; i < privateKeyBytes.length; i++) {
    encrypted[i] = privateKeyBytes[i] ^ keyBytes[i % keyBytes.length];
  }
  
  return btoa(String.fromCharCode(...encrypted));
}

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

    // Verify user is authenticated
    const supabaseAuth = createClient(supabaseUrl, supabaseServiceKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userError } = await supabaseAuth.auth.getUser(authHeader.replace('Bearer ', ''));
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user is admin
    const supabaseService = createClient(supabaseUrl, supabaseServiceKey);
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

    // Parse request body
    let label = 'Generated EVM Wallet';
    let network = 'POLYGON';
    try {
      const body = await req.json();
      if (body.label) label = body.label;
      if (body.network) network = body.network;
    } catch {
      // Use defaults
    }

    // Validate network (mainnets + testnets)
    const validNetworks = ['POLYGON', 'ETHEREUM', 'ARBITRUM', 'BSC', 'SEPOLIA', 'POLYGON_AMOY', 'ARBITRUM_SEPOLIA', 'BSC_TESTNET'];
    if (!validNetworks.includes(network)) {
      return new Response(
        JSON.stringify({ error: `Invalid network. Must be one of: ${validNetworks.join(', ')}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate new EVM wallet
    console.log(`Generating new EVM wallet for ${network}...`);
    const wallet = ethers.Wallet.createRandom();
    const publicKey = wallet.address.toLowerCase();
    const privateKey = wallet.privateKey;

    console.log(`Generated wallet with address: ${publicKey}`);

    // Encrypt the private key (remove 0x prefix for consistency)
    const privateKeyClean = privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey;
    const encryptedPrivateKey = encryptPrivateKey(privateKeyClean, encryptionKey);
    console.log('Private key encrypted successfully');

    // Store in database
    const { data: insertData, error: insertError } = await supabaseService
      .from('evm_fee_payer_keys')
      .insert({
        public_key: publicKey,
        secret_key_encrypted: encryptedPrivateKey,
        label: label,
        network: network,
        is_generated: true,
        is_active: true,
        balance_native: 0,
        usage_count: 0
      })
      .select()
      .single();

    if (insertError) {
      console.error('Failed to insert EVM fee payer:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to store EVM fee payer wallet', details: insertError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Log activity
    await supabaseService.from('activity_logs').insert({
      action_type: 'EVM_FEE_PAYER_GENERATED',
      entity_type: 'evm_fee_payer_key',
      entity_id: insertData.id,
      entity_name: label,
      performed_by: user.id,
      details: { public_key: publicKey, network: network }
    });

    console.log('EVM fee payer wallet generated and stored successfully');

    return new Response(
      JSON.stringify({
        success: true,
        fee_payer: {
          id: insertData.id,
          public_key: publicKey,
          label: insertData.label,
          network: insertData.network,
          is_generated: true,
          is_active: true,
          balance_native: 0
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error generating EVM fee payer:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
