import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "https://esm.sh/@solana/web3.js@1.98.0";
import {
  createMintToInstruction,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
  getAccount,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "https://esm.sh/@solana/spl-token@0.4.9?deps=@solana/web3.js@1.98.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MintToTreasuryRequest {
  tokenDefinitionId: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log('Mint to Treasury function called');

  try {
    const { tokenDefinitionId }: MintToTreasuryRequest = await req.json();
    console.log('Request params:', { tokenDefinitionId });

    if (!tokenDefinitionId) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameter: tokenDefinitionId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
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

    if (tokenDef.chain !== 'SOLANA' || tokenDef.deployment_status !== 'DEPLOYED') {
      return new Response(
        JSON.stringify({ error: 'Token must be deployed on Solana' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!tokenDef.contract_address) {
      return new Response(
        JSON.stringify({ error: 'Token does not have a contract address' }),
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

    const mintPubkey = new PublicKey(tokenDef.contract_address);
    console.log('Mint address:', mintPubkey.toBase58());

    // Get the correct Associated Token Account for treasury
    const treasuryATA = getAssociatedTokenAddressSync(
      mintPubkey,
      feePayerKeypair.publicKey
    );
    console.log('Treasury ATA (correct):', treasuryATA.toBase58());

    // Check if ATA exists
    let ataExists = false;
    let currentBalance = BigInt(0);
    try {
      const ataInfo = await getAccount(connection, treasuryATA);
      ataExists = true;
      currentBalance = ataInfo.amount;
      console.log('ATA exists with balance:', currentBalance.toString());
    } catch {
      console.log('ATA does not exist yet, will create it');
    }

    // Calculate mint amount
    const totalSupplyBaseUnits = BigInt(tokenDef.total_supply) * BigInt(10 ** tokenDef.decimals);
    const amountToMint = totalSupplyBaseUnits - currentBalance;

    if (amountToMint <= 0) {
      console.log('Treasury already has full supply');
      
      // Update database with correct ATA address if different
      if (tokenDef.treasury_account !== treasuryATA.toBase58()) {
        await supabase
          .from('token_definitions')
          .update({ treasury_account: treasuryATA.toBase58() })
          .eq('id', tokenDefinitionId);
      }
      
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Treasury already has full supply',
          treasuryAccount: treasuryATA.toBase58(),
          currentBalance: currentBalance.toString(),
          totalSupply: totalSupplyBaseUnits.toString(),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Amount to mint:', amountToMint.toString());

    const transaction = new Transaction();

    // Create ATA if it doesn't exist
    if (!ataExists) {
      console.log('Adding instruction to create ATA...');
      transaction.add(
        createAssociatedTokenAccountInstruction(
          feePayerKeypair.publicKey, // payer
          treasuryATA, // ata
          feePayerKeypair.publicKey, // owner
          mintPubkey // mint
        )
      );
    }

    // Mint tokens to treasury
    console.log('Adding instruction to mint tokens...');
    transaction.add(
      createMintToInstruction(
        mintPubkey, // mint
        treasuryATA, // destination
        feePayerKeypair.publicKey, // authority (fee payer is mint authority)
        amountToMint // amount
      )
    );

    console.log('Sending transaction...');
    let signature: string;
    try {
      signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [feePayerKeypair],
        { commitment: 'confirmed' }
      );
      console.log('Transaction confirmed:', signature);
    } catch (txError) {
      console.error('Transaction failed:', txError);
      return new Response(
        JSON.stringify({ error: `Transaction failed: ${txError instanceof Error ? txError.message : 'Unknown error'}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update the token definition with the correct treasury account
    const { error: updateError } = await supabase
      .from('token_definitions')
      .update({ treasury_account: treasuryATA.toBase58() })
      .eq('id', tokenDefinitionId);

    if (updateError) {
      console.error('Failed to update token definition:', updateError);
    }

    const newBalance = currentBalance + amountToMint;
    console.log('Minting successful! New treasury balance:', newBalance.toString());

    return new Response(
      JSON.stringify({
        success: true,
        treasuryAccount: treasuryATA.toBase58(),
        mintedAmount: amountToMint.toString(),
        newBalance: newBalance.toString(),
        transactionSignature: signature,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'An unexpected error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
};

serve(handler);
