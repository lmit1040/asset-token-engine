import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { Buffer } from "https://esm.sh/buffer@6.0.3";
import { 
  Connection, 
  Keypair, 
  PublicKey, 
  Transaction, 
  sendAndConfirmTransaction, 
  TransactionInstruction
} from "https://esm.sh/@solana/web3.js@1.98.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface UpdateMetadataRequest {
  tokenDefinitionId: string;
  description?: string;
  imageUrl?: string;
}

// Metaplex Token Metadata Program ID
const TOKEN_METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

// Helper to derive metadata PDA
function getMetadataPDA(mint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [
      new TextEncoder().encode('metadata'),
      TOKEN_METADATA_PROGRAM_ID.toBytes(),
      mint.toBytes(),
    ],
    TOKEN_METADATA_PROGRAM_ID
  );
  return pda;
}

// Create Metaplex UpdateMetadataAccountV2 instruction
function createUpdateMetadataInstruction(
  metadataPDA: PublicKey,
  updateAuthority: PublicKey,
  name: string,
  symbol: string,
  uri: string
): TransactionInstruction {
  // Truncate name to 32 chars and symbol to 10 chars as per Metaplex limits
  const truncatedName = name.slice(0, 32);
  const truncatedSymbol = symbol.slice(0, 10);
  const truncatedUri = uri.slice(0, 200);

  const encoder = new TextEncoder();
  
  // Encode strings with length prefix (4 bytes little-endian)
  const nameBytes = encoder.encode(truncatedName);
  const nameBuffer = new Uint8Array(4 + nameBytes.length);
  new DataView(nameBuffer.buffer).setUint32(0, nameBytes.length, true);
  nameBuffer.set(nameBytes, 4);

  const symbolBytes = encoder.encode(truncatedSymbol);
  const symbolBuffer = new Uint8Array(4 + symbolBytes.length);
  new DataView(symbolBuffer.buffer).setUint32(0, symbolBytes.length, true);
  symbolBuffer.set(symbolBytes, 4);

  const uriBytes = encoder.encode(truncatedUri);
  const uriBuffer = new Uint8Array(4 + uriBytes.length);
  new DataView(uriBuffer.buffer).setUint32(0, uriBytes.length, true);
  uriBuffer.set(uriBytes, 4);

  // Build the instruction data for UpdateMetadataAccountV2
  // Format: discriminator (1) + Option<Data> (1 + data) + Option<PublicKey> (1) + Option<bool> (1)
  const dataPresent = 1; // We're providing data
  const updateAuthorityPresent = 0; // Not updating authority
  const primarySaleHappenedPresent = 0; // Not updating primary sale
  const isMutablePresent = 0; // Not updating mutability

  const totalLength = 1 + 1 + nameBuffer.length + symbolBuffer.length + uriBuffer.length + 2 + 1 + 1 + 1 + 1 + updateAuthorityPresent + 1 + primarySaleHappenedPresent + 1;
  const data = new Uint8Array(totalLength);
  let offset = 0;

  // Discriminator for UpdateMetadataAccountV2
  data[offset++] = 15;

  // Option<Data> - Some(Data)
  data[offset++] = 1; // Some

  // Name
  data.set(nameBuffer, offset);
  offset += nameBuffer.length;

  // Symbol
  data.set(symbolBuffer, offset);
  offset += symbolBuffer.length;

  // URI
  data.set(uriBuffer, offset);
  offset += uriBuffer.length;

  // seller_fee_basis_points = 0 (u16 little-endian)
  data[offset++] = 0;
  data[offset++] = 0;

  // creators = None
  data[offset++] = 0;

  // collection = None
  data[offset++] = 0;

  // uses = None
  data[offset++] = 0;

  // Option<PublicKey> - None (not updating authority)
  data[offset++] = 0;

  // Option<bool> - None (not updating primary_sale_happened)
  data[offset++] = 0;

  // Option<bool> - None (not updating is_mutable)
  data[offset++] = 0;

  return new TransactionInstruction({
    keys: [
      { pubkey: metadataPDA, isSigner: false, isWritable: true },
      { pubkey: updateAuthority, isSigner: true, isWritable: false },
    ],
    programId: TOKEN_METADATA_PROGRAM_ID,
    // deno-lint-ignore no-explicit-any
    data: Buffer.from(data) as any,
  });
}

// Upload metadata JSON to Pinata IPFS
async function uploadToPinata(
  pinataJwt: string,
  metadata: Record<string, unknown>
): Promise<{ success: boolean; ipfsHash?: string; error?: string }> {
  try {
    console.log('Uploading metadata to Pinata...');
    
    const response = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${pinataJwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        pinataContent: metadata,
        pinataMetadata: {
          name: `${metadata.name}-metadata.json`,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Pinata upload failed:', errorText);
      return { success: false, error: `Pinata upload failed: ${errorText}` };
    }

    const result = await response.json();
    console.log('Pinata upload successful:', result.IpfsHash);
    
    return { success: true, ipfsHash: result.IpfsHash };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Pinata upload error:', error);
    return { success: false, error: errorMessage };
  }
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log('Update Token Metadata function called');

  try {
    const { tokenDefinitionId, description, imageUrl }: UpdateMetadataRequest = await req.json();
    console.log('Request params:', { tokenDefinitionId, description, imageUrl });

    if (!tokenDefinitionId) {
      console.error('Missing tokenDefinitionId');
      return new Response(
        JSON.stringify({ error: 'Missing required parameter: tokenDefinitionId' }),
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

    // Initialize Supabase client with service role key
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch the token definition
    const { data: tokenDef, error: fetchError } = await supabase
      .from('token_definitions')
      .select('*')
      .eq('id', tokenDefinitionId)
      .single();

    if (fetchError || !tokenDef) {
      console.error('Token definition not found:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Token definition not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Token definition found:', tokenDef);

    // Validate token is deployed on Solana
    if (tokenDef.chain !== 'SOLANA') {
      console.error('Invalid blockchain - not SOLANA');
      return new Response(
        JSON.stringify({ error: 'Token must be on Solana blockchain' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (tokenDef.deployment_status !== 'DEPLOYED') {
      console.error('Token not deployed');
      return new Response(
        JSON.stringify({ error: 'Token must be deployed first' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!tokenDef.contract_address) {
      console.error('No contract address');
      return new Response(
        JSON.stringify({ error: 'Token has no contract address' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get fee payer keypair from database (automatic rotation)
    console.log('Fetching fee payer from database...');
    const feePayerResponse = await fetch(`${supabaseUrl}/functions/v1/get-fee-payer-keypair`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prefer_least_used: true }),
    });

    if (!feePayerResponse.ok) {
      const errorData = await feePayerResponse.json();
      console.error('Failed to get fee payer:', errorData);
      return new Response(
        JSON.stringify({ error: errorData.error || 'Failed to get fee payer keypair' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const feePayerData = await feePayerResponse.json();
    const feePayerKeypair = Keypair.fromSecretKey(new Uint8Array(feePayerData.secret_key_array));
    console.log('Using fee payer:', feePayerData.public_key, '(label:', feePayerData.label, ')');

    // Connect to Solana Devnet
    const rpcUrl = Deno.env.get('SOLANA_DEVNET_RPC_URL') || 'https://api.devnet.solana.com';
    console.log('Connecting to Solana RPC:', rpcUrl);
    const connection = new Connection(rpcUrl, 'confirmed');

    // Test connection
    try {
      const blockHeight = await connection.getBlockHeight();
      console.log('Connected to Solana Devnet. Block height:', blockHeight);
    } catch (connError: unknown) {
      console.error('Failed to connect to Solana Devnet:', connError);
      return new Response(
        JSON.stringify({ error: 'Failed to connect to Solana Devnet' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const mintPubkey = new PublicKey(tokenDef.contract_address);
    const updateAuthority = feePayerKeypair.publicKey;

    // Derive metadata PDA
    const metadataPDA = getMetadataPDA(mintPubkey);
    console.log('Metadata PDA:', metadataPDA.toBase58());

    // Check if metadata exists (we need it to exist for updating)
    const metadataAccountInfo = await connection.getAccountInfo(metadataPDA);
    if (!metadataAccountInfo) {
      console.error('Metadata does not exist for this token');
      return new Response(
        JSON.stringify({ 
          error: 'Metadata does not exist for this token. Please add metadata first.',
          metadataAddress: metadataPDA.toBase58()
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build Metaplex-standard metadata JSON
    const metadataJson = {
      name: tokenDef.token_name,
      symbol: tokenDef.token_symbol,
      description: description || `${tokenDef.token_name} (${tokenDef.token_symbol}) - A tokenized asset on MetallumX Vault`,
      image: imageUrl || '',
      attributes: [
        { trait_type: 'Total Supply', value: tokenDef.total_supply.toString() },
        { trait_type: 'Decimals', value: tokenDef.decimals.toString() },
        { trait_type: 'Token Model', value: tokenDef.token_model },
        { trait_type: 'Network', value: tokenDef.network },
      ],
      properties: {
        category: 'currency',
        creators: [],
      },
    };

    console.log('Metadata JSON to upload:', metadataJson);

    // Upload metadata to Pinata
    const pinataResult = await uploadToPinata(pinataJwt, metadataJson);
    if (!pinataResult.success || !pinataResult.ipfsHash) {
      return new Response(
        JSON.stringify({ error: pinataResult.error || 'Failed to upload metadata to IPFS' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const ipfsUri = `https://gateway.pinata.cloud/ipfs/${pinataResult.ipfsHash}`;
    console.log('IPFS URI:', ipfsUri);

    // Create transaction to update metadata
    const transaction = new Transaction();
    
    transaction.add(
      createUpdateMetadataInstruction(
        metadataPDA,
        updateAuthority,
        tokenDef.token_name,
        tokenDef.token_symbol,
        ipfsUri
      )
    );

    console.log('Sending transaction to update metadata...');

    // Send and confirm transaction
    let signature: string;
    try {
      signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [feePayerKeypair],
        { commitment: 'confirmed' }
      );
      console.log('Transaction confirmed:', signature);
    } catch (txError: unknown) {
      const errorMessage = txError instanceof Error ? txError.message : 'Unknown transaction error';
      console.error('Transaction failed:', txError);
      return new Response(
        JSON.stringify({ error: `Transaction failed: ${errorMessage}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Metadata updated successfully for token:', tokenDef.token_symbol);

    return new Response(
      JSON.stringify({
        success: true,
        mintAddress: tokenDef.contract_address,
        metadataAddress: metadataPDA.toBase58(),
        transactionSignature: signature,
        ipfsHash: pinataResult.ipfsHash,
        ipfsUri: ipfsUri,
        tokenName: tokenDef.token_name,
        tokenSymbol: tokenDef.token_symbol,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    console.error('Unexpected error in update-token-metadata:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
};

serve(handler);
