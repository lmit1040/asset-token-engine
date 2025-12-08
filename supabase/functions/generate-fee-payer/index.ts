import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Keypair } from "https://esm.sh/@solana/web3.js@1.87.6";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Simple XOR-based encryption with the key (for demonstration - in production use proper AES)
function encryptSecretKey(secretKeyBytes: Uint8Array, encryptionKey: string): string {
  const keyBytes = new TextEncoder().encode(encryptionKey);
  const encrypted = new Uint8Array(secretKeyBytes.length);
  
  for (let i = 0; i < secretKeyBytes.length; i++) {
    encrypted[i] = secretKeyBytes[i] ^ keyBytes[i % keyBytes.length];
  }
  
  // Convert to base64 for storage
  return btoa(String.fromCharCode(...encrypted));
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
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

    // Create client with user's auth token to verify permissions
    const supabaseAuth = createClient(supabaseUrl, supabaseServiceKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Verify user is authenticated
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

    // Parse request body for optional label
    let label = 'Generated Wallet';
    try {
      const body = await req.json();
      if (body.label) {
        label = body.label;
      }
    } catch {
      // Use default label if no body provided
    }

    // Generate new Solana keypair
    console.log('Generating new Solana keypair...');
    const keypair = Keypair.generate();
    const publicKey = keypair.publicKey.toBase58();
    const secretKeyBytes = keypair.secretKey;

    console.log(`Generated keypair with public key: ${publicKey}`);

    // Encrypt the secret key
    const encryptedSecretKey = encryptSecretKey(secretKeyBytes, encryptionKey);
    console.log('Secret key encrypted successfully');

    // Store in database
    const { data: insertData, error: insertError } = await supabaseService
      .from('fee_payer_keys')
      .insert({
        public_key: publicKey,
        secret_key_encrypted: encryptedSecretKey,
        label: label,
        is_generated: true,
        is_active: true,
        balance_sol: 0,
        usage_count: 0
      })
      .select()
      .single();

    if (insertError) {
      console.error('Failed to insert fee payer:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to store fee payer wallet', details: insertError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Log activity
    await supabaseService.from('activity_logs').insert({
      action_type: 'FEE_PAYER_GENERATED',
      entity_type: 'fee_payer_key',
      entity_id: insertData.id,
      entity_name: label,
      performed_by: user.id,
      details: { public_key: publicKey }
    });

    console.log('Fee payer wallet generated and stored successfully');

    return new Response(
      JSON.stringify({
        success: true,
        fee_payer: {
          id: insertData.id,
          public_key: publicKey,
          label: insertData.label,
          is_generated: true,
          is_active: true,
          balance_sol: 0
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error generating fee payer:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
