import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface VerificationResult {
  verified: boolean;
  assetType?: string;
  uploadedAt?: string;
  message: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { hash } = await req.json();

    // Validate hash format (SHA-256 = 64 hex characters)
    if (!hash || typeof hash !== 'string') {
      return new Response(
        JSON.stringify({ 
          verified: false, 
          message: 'Hash is required' 
        } as VerificationResult),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const cleanHash = hash.trim().toLowerCase();
    
    if (!/^[a-f0-9]{64}$/.test(cleanHash)) {
      return new Response(
        JSON.stringify({ 
          verified: false, 
          message: 'Invalid hash format. Expected SHA-256 (64 hexadecimal characters)' 
        } as VerificationResult),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Query for matching hash - only select non-sensitive fields
    const { data: proofFile, error } = await supabase
      .from('proof_of_reserve_files')
      .select('asset_id, uploaded_at')
      .eq('file_hash', cleanHash)
      .maybeSingle();

    if (error) {
      console.error('Error verifying hash:', error);
      throw error;
    }

    if (!proofFile) {
      console.log(`Hash not found: ${cleanHash.substring(0, 16)}...`);
      return new Response(
        JSON.stringify({ 
          verified: false, 
          message: 'Hash not found in verified reserves' 
        } as VerificationResult),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get asset type (not name or other sensitive info)
    const { data: asset, error: assetError } = await supabase
      .from('assets')
      .select('asset_type')
      .eq('id', proofFile.asset_id)
      .maybeSingle();

    if (assetError) {
      console.error('Error fetching asset:', assetError);
    }

    const result: VerificationResult = {
      verified: true,
      assetType: asset?.asset_type || 'UNKNOWN',
      uploadedAt: proofFile.uploaded_at.split('T')[0], // Date only
      message: `Hash verified - matches ${asset?.asset_type || 'reserve'} documentation from ${proofFile.uploaded_at.split('T')[0]}`
    };

    console.log(`Hash verified: ${cleanHash.substring(0, 16)}...`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in verify-reserve-hash:', error);
    return new Response(
      JSON.stringify({ 
        verified: false, 
        message: 'Verification service error' 
      } as VerificationResult),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
