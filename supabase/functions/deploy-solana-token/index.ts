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
import { 
  createInitializeMint2Instruction, 
  createAssociatedTokenAccountInstruction, 
  createMintToInstruction,
  MINT_SIZE, 
  TOKEN_PROGRAM_ID, 
  getMinimumBalanceForRentExemptMint, 
  getAssociatedTokenAddressSync 
} from "https://esm.sh/@solana/spl-token@0.4.9?deps=@solana/web3.js@1.98.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DeployTokenRequest {
  tokenDefinitionId: string;
  adminPublicKey: string;
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

  // Build the instruction data
  // CreateMetadataAccountV3 structure:
  // - discriminator (1 byte): 33
  // - data: DataV2 struct
  //   - name (string)
  //   - symbol (string) 
  //   - uri (string)
  //   - seller_fee_basis_points (u16): 0
  //   - creators (Option<Vec<Creator>>): None (1 byte: 0)
  //   - collection (Option<Collection>): None (1 byte: 0)
  //   - uses (Option<Uses>): None (1 byte: 0)
  // - is_mutable (bool): true (1 byte: 1)
  // - collection_details (Option<CollectionDetails>): None (1 byte: 0)

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

  console.log('Deploy Solana Token function called');

  try {
    const { tokenDefinitionId, adminPublicKey }: DeployTokenRequest = await req.json();
    console.log('Request params:', { tokenDefinitionId, adminPublicKey });

    if (!tokenDefinitionId || !adminPublicKey) {
      console.error('Missing required parameters');
      return new Response(
        JSON.stringify({ error: 'Missing required parameters: tokenDefinitionId and adminPublicKey' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client with service role key for admin access
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

    // Validate token definition
    if (tokenDef.chain !== 'SOLANA') {
      console.error('Invalid blockchain - not SOLANA');
      return new Response(
        JSON.stringify({ error: 'Token must be configured for Solana blockchain' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (tokenDef.network !== 'TESTNET') {
      console.error('Invalid network - not TESTNET');
      return new Response(
        JSON.stringify({ error: 'Token must be configured for Testnet network' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (tokenDef.deployment_status === 'DEPLOYED') {
      console.error('Token already deployed');
      return new Response(
        JSON.stringify({ error: 'Token is already deployed' }),
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

    // Get dynamic Solana connection (mainnet/devnet based on system settings)
    const { getSolanaConnection } = await import("../_shared/solana-connection.ts");
    const { connection, isMainnet, rpcUrl } = await getSolanaConnection();
    console.log(`Connecting to Solana RPC (${isMainnet ? 'MAINNET' : 'DEVNET'}):`, rpcUrl);

    // Test connection by getting block height
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

    // Fee payer is now the mint authority (allows backend to mint tokens)
    const mintAuthority = feePayerKeypair.publicKey;
    console.log('Mint authority (fee payer):', mintAuthority.toBase58());

    // Generate a new keypair for the mint account
    const mintKeypair = Keypair.generate();
    console.log('Generated mint keypair:', mintKeypair.publicKey.toBase58());

    // Get the minimum balance for rent exemption
    const lamportsForMint = await getMinimumBalanceForRentExemptMint(connection);
    console.log('Lamports for mint rent exemption:', lamportsForMint);

    // Create the mint account and initialize it
    const transaction = new Transaction();

    // Add instruction to create the mint account
    transaction.add(
      SystemProgram.createAccount({
        fromPubkey: feePayerKeypair.publicKey,
        newAccountPubkey: mintKeypair.publicKey,
        lamports: lamportsForMint,
        space: MINT_SIZE,
        programId: TOKEN_PROGRAM_ID,
      })
    );

    // Add instruction to initialize the mint (fee payer is now mint authority)
    transaction.add(
      createInitializeMint2Instruction(
        mintKeypair.publicKey,
        tokenDef.decimals,
        mintAuthority, // fee payer as mint authority
        mintAuthority, // fee payer as freeze authority
        TOKEN_PROGRAM_ID
      )
    );

    // Get the associated token account address for the fee payer (treasury)
    const treasuryTokenAccount = getAssociatedTokenAddressSync(
      mintKeypair.publicKey,
      feePayerKeypair.publicKey
    );
    console.log('Treasury token account:', treasuryTokenAccount.toBase58());

    // Create the associated token account for the treasury
    transaction.add(
      createAssociatedTokenAccountInstruction(
        feePayerKeypair.publicKey,
        treasuryTokenAccount,
        feePayerKeypair.publicKey,
        mintKeypair.publicKey
      )
    );

    // Calculate the amount to mint (total_supply is already the full amount we want)
    // The total_supply stored is the display amount, multiply by 10^decimals for base units
    const mintAmount = BigInt(tokenDef.total_supply) * BigInt(10 ** tokenDef.decimals);
    console.log('Minting amount (base units):', mintAmount.toString());

    // Add instruction to mint tokens to treasury
    transaction.add(
      createMintToInstruction(
        mintKeypair.publicKey, // mint
        treasuryTokenAccount, // destination
        mintAuthority, // authority (fee payer)
        mintAmount // amount in base units
      )
    );

    // Add Metaplex Token Metadata instruction
    const metadataPDA = getMetadataPDA(mintKeypair.publicKey);
    console.log('Metadata PDA:', metadataPDA.toBase58());

    transaction.add(
      createMetadataInstruction(
        metadataPDA,
        mintKeypair.publicKey,
        mintAuthority, // mint authority
        feePayerKeypair.publicKey, // payer
        mintAuthority, // update authority
        tokenDef.token_name,
        tokenDef.token_symbol,
        '' // Empty URI for now - can add IPFS metadata later
      )
    );

    console.log('Sending transaction with metadata...');

    // Send and confirm transaction
    let signature: string;
    try {
      signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [feePayerKeypair, mintKeypair],
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

    // Update the token definition with the mint address and treasury account
    const { error: updateError } = await supabase
      .from('token_definitions')
      .update({
        contract_address: mintKeypair.publicKey.toBase58(),
        treasury_account: treasuryTokenAccount.toBase58(),
        deployment_status: 'DEPLOYED',
      })
      .eq('id', tokenDefinitionId);

    if (updateError) {
      console.error('Failed to update token definition:', updateError);
      // Token was created on-chain but we failed to update the database
      // Return success with a warning
      return new Response(
        JSON.stringify({
          warning: 'Token deployed but failed to update database',
          mintAddress: mintKeypair.publicKey.toBase58(),
          treasuryAccount: treasuryTokenAccount.toBase58(),
          metadataAddress: metadataPDA.toBase58(),
          transactionSignature: signature,
          deploymentStatus: 'DEPLOYED',
          mintedAmount: mintAmount.toString(),
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Token deployment with metadata successful! Minted', mintAmount.toString(), 'base units to treasury');

    return new Response(
      JSON.stringify({
        mintAddress: mintKeypair.publicKey.toBase58(),
        treasuryAccount: treasuryTokenAccount.toBase58(),
        metadataAddress: metadataPDA.toBase58(),
        transactionSignature: signature,
        deploymentStatus: 'DEPLOYED',
        mintedAmount: mintAmount.toString(),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    console.error('Unexpected error in deploy-solana-token:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
};

serve(handler);
