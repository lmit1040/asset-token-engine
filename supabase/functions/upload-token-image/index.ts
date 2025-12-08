import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface UploadImageRequest {
  tokenDefinitionId: string;
  imageBase64: string;
  fileName: string;
  mimeType: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log('Upload Token Image function called');

  try {
    const { tokenDefinitionId, imageBase64, fileName, mimeType }: UploadImageRequest = await req.json();
    console.log('Request params:', { tokenDefinitionId, fileName, mimeType, imageSize: imageBase64?.length });

    if (!tokenDefinitionId || !imageBase64 || !fileName || !mimeType) {
      console.error('Missing required parameters');
      return new Response(
        JSON.stringify({ error: 'Missing required parameters: tokenDefinitionId, imageBase64, fileName, mimeType' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate mime type
    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/gif'];
    if (!allowedTypes.includes(mimeType)) {
      return new Response(
        JSON.stringify({ error: `Invalid image type. Allowed: ${allowedTypes.join(', ')}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check for Pinata JWT
    const pinataJwt = Deno.env.get('PINATA_JWT');
    if (!pinataJwt) {
      console.error('Pinata JWT not configured');
      return new Response(
        JSON.stringify({ error: 'Server configuration error: Pinata JWT not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify token definition exists
    const { data: tokenDef, error: fetchError } = await supabase
      .from('token_definitions')
      .select('id, token_name, token_symbol')
      .eq('id', tokenDefinitionId)
      .single();

    if (fetchError || !tokenDef) {
      console.error('Token definition not found:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Token definition not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Convert base64 to binary
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    
    // Check file size (max 5MB)
    const maxSize = 5 * 1024 * 1024;
    if (binaryData.length > maxSize) {
      return new Response(
        JSON.stringify({ error: 'Image too large. Maximum size is 5MB.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Uploading image to Pinata...', { size: binaryData.length });

    // Upload to Pinata using pinFileToIPFS
    const formData = new FormData();
    const blob = new Blob([binaryData], { type: mimeType });
    formData.append('file', blob, fileName);
    formData.append('pinataMetadata', JSON.stringify({
      name: `${tokenDef.token_symbol}-icon`,
    }));

    const pinataResponse = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${pinataJwt}`,
      },
      body: formData,
    });

    if (!pinataResponse.ok) {
      const errorText = await pinataResponse.text();
      console.error('Pinata upload failed:', errorText);
      return new Response(
        JSON.stringify({ error: `Failed to upload to IPFS: ${errorText}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const pinataResult = await pinataResponse.json();
    console.log('Pinata upload successful:', pinataResult.IpfsHash);

    const ipfsUrl = `https://gateway.pinata.cloud/ipfs/${pinataResult.IpfsHash}`;

    // Update token definition with image URL
    const { error: updateError } = await supabase
      .from('token_definitions')
      .update({ token_image_url: ipfsUrl })
      .eq('id', tokenDefinitionId);

    if (updateError) {
      console.error('Failed to update token definition:', updateError);
      return new Response(
        JSON.stringify({ error: 'Image uploaded but failed to save URL to database' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Token image URL saved:', ipfsUrl);

    return new Response(
      JSON.stringify({
        success: true,
        ipfsHash: pinataResult.IpfsHash,
        imageUrl: ipfsUrl,
        tokenSymbol: tokenDef.token_symbol,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    console.error('Unexpected error in upload-token-image:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
};

serve(handler);
