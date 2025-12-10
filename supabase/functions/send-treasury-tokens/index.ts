import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "https://esm.sh/@solana/web3.js@1.98.0";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAccount,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "https://esm.sh/@solana/spl-token@0.4.9";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tokenDefinitionId, recipientAddress, amount } = await req.json();

    console.log("Send treasury tokens request:", {
      tokenDefinitionId,
      recipientAddress,
      amount,
    });

    // Validate inputs
    if (!tokenDefinitionId || !recipientAddress || !amount) {
      throw new Error(
        "Missing required fields: tokenDefinitionId, recipientAddress, amount"
      );
    }

    if (typeof amount !== "number" || amount <= 0) {
      throw new Error("Amount must be a positive number");
    }

    // Validate recipient is a valid Solana public key
    let recipientPubkey: PublicKey;
    try {
      recipientPubkey = new PublicKey(recipientAddress);
    } catch {
      throw new Error("Invalid recipient Solana address");
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch token definition
    const { data: token, error: tokenError } = await supabase
      .from("token_definitions")
      .select("*")
      .eq("id", tokenDefinitionId)
      .single();

    if (tokenError || !token) {
      throw new Error("Token definition not found");
    }

    console.log("Token definition:", token);

    // Validate token is deployable Solana token
    if (token.chain !== "SOLANA") {
      throw new Error("Token must be on SOLANA blockchain");
    }

    if (token.network !== "TESTNET") {
      throw new Error("Only TESTNET (Devnet) transfers are supported");
    }

    if (token.deployment_status !== "DEPLOYED") {
      throw new Error("Token must be deployed before transfers");
    }

    if (!token.contract_address || !token.treasury_account) {
      throw new Error("Token missing contract_address or treasury_account");
    }

    // Get Solana connection
    const rpcUrl =
      Deno.env.get("SOLANA_DEVNET_RPC_URL") || "https://api.devnet.solana.com";
    const connection = new Connection(rpcUrl, "confirmed");

    // Parse addresses
    const mintPubkey = new PublicKey(token.contract_address);
    const treasuryPubkey = new PublicKey(token.treasury_account);

    // Find which fee payer owns the treasury account by matching ATAs
    console.log("Finding fee payer that owns treasury account...");
    const { data: feePayerKeys, error: feePayerError } = await supabase
      .from("fee_payer_keys")
      .select("id, public_key, label")
      .eq("is_active", true);

    if (feePayerError || !feePayerKeys || feePayerKeys.length === 0) {
      throw new Error("No active fee payers found");
    }

    let matchingFeePayerId: string | null = null;
    let matchingFeePayerLabel: string | null = null;

    // Check each fee payer to find the one whose ATA matches the treasury
    for (const fp of feePayerKeys) {
      const fpPubkey = new PublicKey(fp.public_key);
      const derivedAta = await getAssociatedTokenAddress(
        mintPubkey,
        fpPubkey,
        false,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );
      
      if (derivedAta.equals(treasuryPubkey)) {
        matchingFeePayerId = fp.id;
        matchingFeePayerLabel = fp.label;
        console.log("Found matching fee payer:", fp.public_key, "(label:", fp.label, ")");
        break;
      }
    }

    if (!matchingFeePayerId) {
      throw new Error("Could not find fee payer that owns the treasury account. The treasury may have been created by a deactivated fee payer.");
    }

    // Get the specific fee payer keypair
    const feePayerResponse = await fetch(`${supabaseUrl}/functions/v1/get-fee-payer-keypair`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${supabaseServiceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fee_payer_id: matchingFeePayerId }),
    });

    if (!feePayerResponse.ok) {
      const errorData = await feePayerResponse.json();
      console.error("Failed to get fee payer:", errorData);
      throw new Error(errorData.error || "Failed to get fee payer keypair");
    }

    const feePayerData = await feePayerResponse.json();
    const feePayer = Keypair.fromSecretKey(new Uint8Array(feePayerData.secret_key_array));
    console.log("Using treasury owner fee payer:", feePayerData.public_key, "(label:", matchingFeePayerLabel, ")");

    // Calculate raw amount based on decimals
    const decimals = token.decimals || 0;
    const rawAmount = BigInt(Math.floor(amount * Math.pow(10, decimals)));

    console.log("Transfer details:", {
      mint: mintPubkey.toString(),
      treasury: treasuryPubkey.toString(),
      recipient: recipientPubkey.toString(),
      amount,
      decimals,
      rawAmount: rawAmount.toString(),
    });

    // Get or create recipient's associated token account
    const recipientAta = await getAssociatedTokenAddress(
      mintPubkey,
      recipientPubkey,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    console.log("Recipient ATA:", recipientAta.toString());

    // Check if recipient ATA exists
    let recipientAtaExists = false;
    try {
      await getAccount(connection, recipientAta);
      recipientAtaExists = true;
      console.log("Recipient ATA exists");
    } catch {
      console.log("Recipient ATA does not exist, will create");
    }

    // Build transaction
    const transaction = new Transaction();

    // Create ATA if it doesn't exist
    if (!recipientAtaExists) {
      transaction.add(
        createAssociatedTokenAccountInstruction(
          feePayer.publicKey, // payer
          recipientAta, // ata
          recipientPubkey, // owner
          mintPubkey, // mint
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        )
      );
    }

    // Add transfer instruction
    transaction.add(
      createTransferInstruction(
        treasuryPubkey, // source
        recipientAta, // destination
        feePayer.publicKey, // owner of source (fee payer is treasury owner)
        rawAmount,
        [],
        TOKEN_PROGRAM_ID
      )
    );

    // Send and confirm transaction
    console.log("Sending transaction...");
    const txSignature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [feePayer],
      { commitment: "confirmed" }
    );

    console.log("Transaction confirmed:", txSignature);

    const explorerUrl = `https://solscan.io/tx/${txSignature}?cluster=devnet`;

    return new Response(
      JSON.stringify({
        success: true,
        txSignature,
        recipientTokenAccount: recipientAta.toString(),
        explorerUrl,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in send-treasury-tokens:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
