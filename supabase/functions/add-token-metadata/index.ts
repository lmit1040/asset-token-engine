import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { Buffer } from "https://esm.sh/buffer@6.0.3";
import { 
  Connection, 
  Keypair, 
  PublicKey, 
  Transaction, 
  sendAndConfirmTransaction, 
  SystemProgram,
  TransactionInstruction
} from "https://esm.sh/@solana/web3.js@1.98.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AddMetadataRequest {
  tokenDefinitionId: string;
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

// Create Metaplex CreateMetadataAccountV3 instruction
function createMetadataInstruction(
  metadataPDA: PublicKey,
  mint: PublicKey,
  mintAuthority: PublicKey,
  payer: PublicKey,
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

  // Build the instruction data for CreateMetadataAccountV3
  const totalLength = 1 + nameBuffer.length + symbolBuffer.length + uriBuffer.length + 2 + 1 + 1 + 1 + 1 + 1;
  const data = new Uint8Array(totalLength);
  let offset = 0;

  // Discriminator for CreateMetadataAccountV3
  data[offset++] = 33;

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

  // is_mutable = true
  data[offset++] = 1;

  // collection_details = None
  data[offset++] = 0;

  return new TransactionInstruction({
    keys: [
      { pubkey: metadataPDA, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: mintAuthority, isSigner: true, isWritable: false },
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: updateAuthority, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: TOKEN_METADATA_PROGRAM_ID,
    // deno-lint-ignore no-explicit-any
    data: Buffer.from(data) as any,
  });
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log('Add Token Metadata function called');

  try {
    const { tokenDefinitionId }: AddMetadataRequest = await req.json();
    console.log('Request params:', { tokenDefinitionId });

    if (!tokenDefinitionId) {
      console.error('Missing tokenDefinitionId');
      return new Response(
        JSON.stringify({ error: 'Missing required parameter: tokenDefinitionId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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

    // Get fee payer keypair (which is also the mint authority)
    const feePayerSecretKey = Deno.env.get('SOLANA_FEE_PAYER_SECRET_KEY');
    if (!feePayerSecretKey) {
      console.error('Fee payer secret key not configured');
      return new Response(
        JSON.stringify({ error: 'Server configuration error: fee payer not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let feePayerKeypair: Keypair;
    try {
      const secretKeyArray = JSON.parse(feePayerSecretKey);
      feePayerKeypair = Keypair.fromSecretKey(new Uint8Array(secretKeyArray));
      console.log('Fee payer public key:', feePayerKeypair.publicKey.toBase58());
    } catch (parseError: unknown) {
      console.error('Failed to parse fee payer secret key:', parseError);
      return new Response(
        JSON.stringify({ error: 'Server configuration error: invalid fee payer key format' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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
    const mintAuthority = feePayerKeypair.publicKey;

    // Derive metadata PDA
    const metadataPDA = getMetadataPDA(mintPubkey);
    console.log('Metadata PDA:', metadataPDA.toBase58());

    // Check if metadata already exists
    const metadataAccountInfo = await connection.getAccountInfo(metadataPDA);
    if (metadataAccountInfo) {
      console.log('Metadata already exists for this token');
      return new Response(
        JSON.stringify({ 
          error: 'Metadata already exists for this token',
          metadataAddress: metadataPDA.toBase58()
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create transaction to add metadata
    const transaction = new Transaction();
    
    transaction.add(
      createMetadataInstruction(
        metadataPDA,
        mintPubkey,
        mintAuthority, // mint authority (fee payer)
        feePayerKeypair.publicKey, // payer
        mintAuthority, // update authority
        tokenDef.token_name,
        tokenDef.token_symbol,
        '' // Empty URI - can add IPFS metadata later
      )
    );

    console.log('Sending transaction to add metadata...');

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

    console.log('Metadata added successfully for token:', tokenDef.token_symbol);

    return new Response(
      JSON.stringify({
        success: true,
        mintAddress: tokenDef.contract_address,
        metadataAddress: metadataPDA.toBase58(),
        transactionSignature: signature,
        tokenName: tokenDef.token_name,
        tokenSymbol: tokenDef.token_symbol,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    console.error('Unexpected error in add-token-metadata:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
};

serve(handler);
