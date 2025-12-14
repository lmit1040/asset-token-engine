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

    // Get dynamic Solana connection (mainnet/devnet based on system settings)
    const { getSolanaConnection } = await import("../_shared/solana-connection.ts");
    const { connection, isMainnet, rpcUrl } = await getSolanaConnection();
    console.log(`Connecting to Solana RPC (${isMainnet ? 'MAINNET' : 'DEVNET'}):`, rpcUrl);

    const mintPubkey = new PublicKey(tokenDef.contract_address);
    console.log('Mint address:', mintPubkey.toBase58());

    // Find the fee payer that is the mint authority by matching treasury ATA
    // The fee payer that deployed the token is the mint authority
    console.log('Finding mint authority fee payer...');
    
    const { data: allFeePayers, error: feePayerListError } = await supabase
      .from('fee_payer_keys')
      .select('id, public_key, label')
      .eq('is_active', true);

    if (feePayerListError || !allFeePayers || allFeePayers.length === 0) {
      console.error('Failed to fetch fee payers:', feePayerListError);
      return new Response(
        JSON.stringify({ error: 'No active fee payers found' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Find which fee payer's ATA matches the stored treasury_account
    let mintAuthorityFeePayerId: string | null = null;
    let mintAuthorityPublicKey: PublicKey | null = null;

    for (const fp of allFeePayers) {
      const fpPubkey = new PublicKey(fp.public_key);
      const derivedATA = getAssociatedTokenAddressSync(mintPubkey, fpPubkey);
      console.log(`Fee payer ${fp.label} (${fp.public_key}) -> ATA: ${derivedATA.toBase58()}`);
      
      if (derivedATA.toBase58() === tokenDef.treasury_account) {
        mintAuthorityFeePayerId = fp.id;
        mintAuthorityPublicKey = fpPubkey;
        console.log(`Found mint authority: ${fp.label} (${fp.public_key})`);
        break;
      }
    }

    if (!mintAuthorityFeePayerId || !mintAuthorityPublicKey) {
      console.error('Could not find mint authority fee payer. Treasury account:', tokenDef.treasury_account);
      return new Response(
        JSON.stringify({ 
          error: 'Could not identify mint authority. The original deployer fee payer may be inactive or removed.',
          hint: 'The treasury account does not match any active fee payer ATAs'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the keypair for the mint authority fee payer
    console.log('Fetching mint authority keypair...');
    const feePayerResponse = await fetch(`${supabaseUrl}/functions/v1/get-fee-payer-keypair`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fee_payer_id: mintAuthorityFeePayerId }),
    });

    if (!feePayerResponse.ok) {
      const errorData = await feePayerResponse.json();
      console.error('Failed to get fee payer keypair:', errorData);
      return new Response(
        JSON.stringify({ error: errorData.error || 'Failed to get fee payer keypair' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const feePayerData = await feePayerResponse.json();
    const feePayerKeypair = Keypair.fromSecretKey(new Uint8Array(feePayerData.secret_key_array));
    console.log('Using mint authority fee payer:', feePayerData.public_key, '(label:', feePayerData.label, ')');

    // Use the stored treasury account (which is the ATA for this mint authority)
    const treasuryATA = new PublicKey(tokenDef.treasury_account);
    console.log('Treasury ATA:', treasuryATA.toBase58());

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
