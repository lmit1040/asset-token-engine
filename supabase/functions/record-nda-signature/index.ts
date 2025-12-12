import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Connection, Keypair, Transaction, TransactionInstruction, PublicKey, sendAndConfirmTransaction } from "https://esm.sh/@solana/web3.js@1.87.6";

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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
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

        // Sign and send transaction
        const signature = await sendAndConfirmTransaction(
          connection,
          transaction,
          [feePayerKeypair],
          { commitment: 'confirmed' }
        );

        blockchainTxSignature = signature;
        blockchainRecordedAt = new Date().toISOString();
        
        console.log(`NDA signature recorded on Solana: ${signature}`);
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
