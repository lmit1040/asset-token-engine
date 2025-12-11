import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { 
  Connection, 
  Keypair, 
  PublicKey, 
  Transaction, 
  sendAndConfirmTransaction 
} from "https://esm.sh/@solana/web3.js@1.98.0";
import { 
  createTransferInstruction,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
  getAssociatedTokenAddress,
  getAccount,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID
} from "https://esm.sh/@solana/spl-token@0.4.9?deps=@solana/web3.js@1.98.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TransferTokenRequest {
  holdingId: string;
  amount: number;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log('Transfer Solana Token function called');

  try {
    const { holdingId, amount }: TransferTokenRequest = await req.json();
    console.log('Request params:', { holdingId, amount });

    if (!holdingId || !amount || amount <= 0) {
      console.error('Missing or invalid parameters');
      return new Response(
        JSON.stringify({ error: 'Missing or invalid parameters: holdingId and amount > 0 required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch the holding with token definition (separate query for user profile)
    const { data: holding, error: holdingError } = await supabase
      .from('user_token_holdings')
      .select(`
        *,
        token_definition:token_definitions(*)
      `)
      .eq('id', holdingId)
      .single();

    if (holdingError || !holding) {
      console.error('Holding not found:', holdingError);
      return new Response(
        JSON.stringify({ error: 'Token holding not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch user profile separately
    const { data: user, error: userError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', holding.user_id)
      .single();

    if (userError || !user) {
      console.error('User profile not found:', userError);
      return new Response(
        JSON.stringify({ error: 'User profile not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Holding found:', JSON.stringify(holding, null, 2));
    console.log('User found:', user.email);

    const tokenDef = holding.token_definition;

    // Validate token is deployed on Solana
    if (tokenDef.chain !== 'SOLANA') {
      return new Response(
        JSON.stringify({ error: 'Token is not on Solana blockchain' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (tokenDef.deployment_status !== 'DEPLOYED') {
      return new Response(
        JSON.stringify({ error: 'Token is not deployed yet' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!tokenDef.contract_address || !tokenDef.treasury_account) {
      return new Response(
        JSON.stringify({ error: 'Token missing contract address or treasury account' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check user has Solana wallet
    if (!user.solana_wallet_address) {
      return new Response(
        JSON.stringify({ error: 'User does not have a Solana wallet connected' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate amount
    if (amount > Number(holding.balance)) {
      return new Response(
        JSON.stringify({ error: `Insufficient balance. Available: ${holding.balance}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Connect to Solana Devnet
    const rpcUrl = Deno.env.get('SOLANA_DEVNET_RPC_URL') || 'https://api.devnet.solana.com';
    console.log('Connecting to Solana RPC:', rpcUrl);
    const connection = new Connection(rpcUrl, 'confirmed');

    // Parse addresses
    const mintAddress = new PublicKey(tokenDef.contract_address);
    const treasuryTokenAccount = new PublicKey(tokenDef.treasury_account);

    // Find which fee payer owns the treasury account by matching ATAs
    console.log('Finding fee payer that owns treasury account...');
    const { data: feePayerKeys, error: feePayerError } = await supabase
      .from('fee_payer_keys')
      .select('id, public_key, label')
      .eq('is_active', true);

    if (feePayerError || !feePayerKeys || feePayerKeys.length === 0) {
      console.error('No active fee payers found:', feePayerError);
      return new Response(
        JSON.stringify({ error: 'No active fee payers found' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let matchingFeePayerId: string | null = null;
    let matchingFeePayerLabel: string | null = null;

    // Check each fee payer to find the one whose ATA matches the treasury
    for (const fp of feePayerKeys) {
      const fpPubkey = new PublicKey(fp.public_key);
      const derivedAta = await getAssociatedTokenAddress(
        mintAddress,
        fpPubkey,
        false,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );
      
      if (derivedAta.equals(treasuryTokenAccount)) {
        matchingFeePayerId = fp.id;
        matchingFeePayerLabel = fp.label;
        console.log('Found matching fee payer:', fp.public_key, '(label:', fp.label, ')');
        break;
      }
    }

    if (!matchingFeePayerId) {
      console.error('Could not find fee payer that owns treasury account');
      return new Response(
        JSON.stringify({ error: 'Could not find fee payer that owns the treasury account. The treasury may have been created by a deactivated fee payer.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the specific fee payer keypair that owns the treasury
    console.log('Fetching treasury owner fee payer keypair...');
    const feePayerResponse = await fetch(`${supabaseUrl}/functions/v1/get-fee-payer-keypair`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fee_payer_id: matchingFeePayerId }),
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
    console.log('Using treasury owner fee payer:', feePayerData.public_key, '(label:', matchingFeePayerLabel, ')');

    const recipientWallet = new PublicKey(user.solana_wallet_address);

    console.log('Mint address:', mintAddress.toBase58());
    console.log('Treasury account:', treasuryTokenAccount.toBase58());
    console.log('Recipient wallet:', recipientWallet.toBase58());

    // Calculate transfer amount with decimals
    const transferAmountWithDecimals = BigInt(Math.floor(amount * Math.pow(10, tokenDef.decimals)));
    console.log('Transfer amount with decimals:', transferAmountWithDecimals.toString());

    // CHECK TREASURY BALANCE BEFORE TRANSFER
    console.log('Checking treasury balance...');
    try {
      const treasuryAccountInfo = await getAccount(connection, treasuryTokenAccount);
      const treasuryBalance = treasuryAccountInfo.amount;
      console.log('Treasury balance (raw):', treasuryBalance.toString());
      
      if (treasuryBalance < transferAmountWithDecimals) {
        const treasuryBalanceHuman = Number(treasuryBalance) / Math.pow(10, tokenDef.decimals);
        console.error('Insufficient treasury balance:', treasuryBalanceHuman, 'requested:', amount);
        return new Response(
          JSON.stringify({ 
            error: `Insufficient treasury balance. Treasury has ${treasuryBalanceHuman.toLocaleString()} ${tokenDef.token_symbol}, but ${amount.toLocaleString()} requested. Please mint more tokens to the treasury first.`,
            treasuryBalance: treasuryBalanceHuman,
            requestedAmount: amount,
            tokenSymbol: tokenDef.token_symbol,
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      console.log('Treasury balance sufficient for transfer');
    } catch (treasuryError) {
      console.error('Failed to fetch treasury account:', treasuryError);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to verify treasury balance. The treasury account may not exist or be inaccessible.',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get or create recipient's associated token account
    const recipientTokenAccount = getAssociatedTokenAddressSync(
      mintAddress,
      recipientWallet
    );
    console.log('Recipient token account:', recipientTokenAccount.toBase58());

    const transaction = new Transaction();

    // Check if recipient token account exists
    let recipientAccountExists = false;
    try {
      await getAccount(connection, recipientTokenAccount);
      recipientAccountExists = true;
      console.log('Recipient token account exists');
    } catch {
      console.log('Recipient token account does not exist, will create');
    }

    // Create recipient token account if needed
    if (!recipientAccountExists) {
      transaction.add(
        createAssociatedTokenAccountInstruction(
          feePayerKeypair.publicKey,
          recipientTokenAccount,
          recipientWallet,
          mintAddress,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        )
      );
    }

    // Add transfer instruction
    transaction.add(
      createTransferInstruction(
        treasuryTokenAccount,
        recipientTokenAccount,
        feePayerKeypair.publicKey, // Owner of treasury account is the fee payer
        transferAmountWithDecimals,
        [],
        TOKEN_PROGRAM_ID
      )
    );

    console.log('Sending transaction...');

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

    // Update holding balance (subtract delivered amount)
    const newBalance = Number(holding.balance) - amount;
    const { error: updateError } = await supabase
      .from('user_token_holdings')
      .update({
        balance: newBalance,
        delivery_wallet_address: user.solana_wallet_address,
        delivery_wallet_type: 'SOLANA',
      })
      .eq('id', holdingId);

    if (updateError) {
      console.error('Failed to update holding balance:', updateError);
      // Transaction succeeded but DB update failed - log warning
      return new Response(
        JSON.stringify({
          warning: 'Tokens transferred on-chain but failed to update database',
          transactionSignature: signature,
          recipientTokenAccount: recipientTokenAccount.toBase58(),
          amountTransferred: amount,
          newBalance,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Log activity
    await supabase.from('activity_logs').insert({
      action_type: 'tokens_delivered_onchain',
      entity_type: 'user_token_holding',
      entity_id: holdingId,
      entity_name: `${tokenDef.token_symbol} on-chain delivery`,
      details: {
        user_id: user.id,
        user_email: user.email,
        token_symbol: tokenDef.token_symbol,
        amount,
        recipient_wallet: user.solana_wallet_address,
        recipient_token_account: recipientTokenAccount.toBase58(),
        transaction_signature: signature,
        new_balance: newBalance,
      },
    });

    console.log('On-chain token transfer successful!');

    return new Response(
      JSON.stringify({
        success: true,
        transactionSignature: signature,
        recipientTokenAccount: recipientTokenAccount.toBase58(),
        amountTransferred: amount,
        newBalance,
        explorerUrl: `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    console.error('Unexpected error in transfer-solana-token:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
};

serve(handler);
