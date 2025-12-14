import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Connection, Keypair, Transaction, TransactionInstruction, PublicKey } from "https://esm.sh/@solana/web3.js@1.87.6";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limiter.ts";
import { logEdgeFunctionActivity } from "../_shared/activity-logger.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RecordNDARequest {
  userId: string;
  signerName: string;
  signerEmail: string;
  ndaVersion: string;
  signatureHash: string;
  ipAddress?: string;
  userAgent?: string;
}

// Helper to wait for transaction confirmation without WebSocket
async function confirmTransaction(connection: Connection, signature: string, maxRetries = 30): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    const status = await connection.getSignatureStatus(signature);
    if (status?.value?.confirmationStatus === 'confirmed' || status?.value?.confirmationStatus === 'finalized') {
      return true;
    }
    if (status?.value?.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(status.value.err)}`);
    }
    // Wait 1 second before checking again
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  return false;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Rate limiting
  const rateLimit = await checkRateLimit(req, 'record-nda-signature');
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit, corsHeaders);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Authenticate request
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Authorization header required');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const body: RecordNDARequest = await req.json();
    const { userId, signerName, signerEmail, ndaVersion, signatureHash, ipAddress, userAgent } = body;

    // Verify user matches authenticated user
    if (user.id !== userId) {
      throw new Error('User mismatch');
    }

    console.log(`Recording NDA signature for user ${userId}, hash: ${signatureHash}`);

    // Record to Solana blockchain
    let blockchainTxSignature: string | null = null;
    let blockchainRecordedAt: string | null = null;

    try {
      const rpcUrl = Deno.env.get('SOLANA_DEVNET_RPC_URL') || 'https://api.devnet.solana.com';
      const connection = new Connection(rpcUrl, 'confirmed');

      // Get fee payer
      const feePayerSecretKey = Deno.env.get('SOLANA_FEE_PAYER_SECRET_KEY');
      if (!feePayerSecretKey) {
        console.log('No fee payer configured, skipping blockchain recording');
      } else {
        const feePayerKeypair = Keypair.fromSecretKey(new Uint8Array(JSON.parse(feePayerSecretKey)));
        
        // Create memo instruction with NDA signature data
        const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
        
        const memoData = JSON.stringify({
          type: 'NDA_SIGNATURE',
          version: ndaVersion,
          hash: signatureHash,
          timestamp: new Date().toISOString(),
          platform: 'MetallumX'
        });

        // Convert string to Uint8Array
        const encoder = new TextEncoder();
        const memoBytes = encoder.encode(memoData);

        const memoInstruction = new TransactionInstruction({
          keys: [],
          programId: MEMO_PROGRAM_ID,
          data: memoBytes,
        });

        const transaction = new Transaction().add(memoInstruction);
        
        // Get recent blockhash
        const { blockhash } = await connection.getLatestBlockhash('confirmed');
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = feePayerKeypair.publicKey;

        // Sign transaction
        transaction.sign(feePayerKeypair);

        // Send transaction (without WebSocket confirmation)
        const signature = await connection.sendRawTransaction(transaction.serialize(), {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
        });

        console.log(`Transaction sent: ${signature}, waiting for confirmation...`);

        // Wait for confirmation using polling instead of WebSocket
        const confirmed = await confirmTransaction(connection, signature);
        
        if (confirmed) {
          blockchainTxSignature = signature;
          blockchainRecordedAt = new Date().toISOString();
          console.log(`NDA signature recorded on Solana: ${signature}`);
        } else {
          console.log('Transaction confirmation timed out, but may still succeed');
          blockchainTxSignature = signature; // Still store the signature
          blockchainRecordedAt = new Date().toISOString();
        }
      }
    } catch (blockchainError) {
      console.error('Blockchain recording failed:', blockchainError);
      // Continue without blockchain - we'll still store in database
    }

    // Insert NDA signature record (using service role to bypass RLS for initial insert)
    const { data: ndaRecord, error: insertError } = await supabase
      .from('nda_signatures')
      .insert({
        user_id: userId,
        signer_name: signerName,
        signer_email: signerEmail,
        nda_version: ndaVersion,
        signature_hash: signatureHash,
        ip_address: ipAddress || null,
        user_agent: userAgent || null,
        blockchain_tx_signature: blockchainTxSignature,
        blockchain_recorded_at: blockchainRecordedAt,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Database insert error:', insertError);
      throw new Error(`Failed to record NDA signature: ${insertError.message}`);
    }

    console.log(`NDA signature saved to database with id: ${ndaRecord.id}`);

    return new Response(JSON.stringify({
      success: true,
      ndaId: ndaRecord.id,
      blockchainTxSignature,
      blockchainRecordedAt,
      explorerUrl: blockchainTxSignature 
        ? `https://solscan.io/tx/${blockchainTxSignature}?cluster=devnet`
        : null,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('Error recording NDA signature:', errorMessage);
    return new Response(JSON.stringify({ 
      success: false,
      error: errorMessage 
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
