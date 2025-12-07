import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { 
  Connection, 
  Keypair, 
  PublicKey, 
  Transaction, 
  sendAndConfirmTransaction, 
  SystemProgram
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

    // Get fee payer keypair from environment
    const feePayerSecretKey = Deno.env.get('SOLANA_FEE_PAYER_SECRET_KEY');
    if (!feePayerSecretKey) {
      console.error('Fee payer secret key not configured');
      return new Response(
        JSON.stringify({ error: 'Server configuration error: fee payer not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse the fee payer secret key (JSON array format)
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

    console.log('Sending transaction...');

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
          transactionSignature: signature,
          deploymentStatus: 'DEPLOYED',
          mintedAmount: mintAmount.toString(),
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Token deployment successful! Minted', mintAmount.toString(), 'base units to treasury');

    return new Response(
      JSON.stringify({
        mintAddress: mintKeypair.publicKey.toBase58(),
        treasuryAccount: treasuryTokenAccount.toBase58(),
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
