import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Connection, PublicKey } from "https://esm.sh/@solana/web3.js@1.95.8";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BalanceRequest {
  walletAddress: string;
  mintAddresses?: string[];
  isTreasuryAccount?: boolean; // If true, walletAddress is a token account, not a wallet
}

interface TokenBalance {
  mint: string;
  balance: number;
  rawBalance: string;
  decimals: number;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { walletAddress, mintAddresses, isTreasuryAccount }: BalanceRequest = await req.json();

    if (!walletAddress) {
      console.error('Missing walletAddress parameter');
      return new Response(
        JSON.stringify({ success: false, error: 'walletAddress is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Fetching balances for ${isTreasuryAccount ? 'token account' : 'wallet'}: ${walletAddress}`);
    if (mintAddresses?.length) {
      console.log(`Filtering for mints: ${mintAddresses.join(', ')}`);
    }

    // Connect to Solana Devnet
    const rpcUrl = Deno.env.get('SOLANA_DEVNET_RPC_URL') || 'https://api.devnet.solana.com';
    const connection = new Connection(rpcUrl, 'confirmed');

    let addressPubkey: PublicKey;
    try {
      addressPubkey = new PublicKey(walletAddress);
    } catch {
      console.error('Invalid wallet address format');
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid wallet address format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const balances: TokenBalance[] = [];

    // If this is a treasury/token account (ATA), fetch balance directly
    if (isTreasuryAccount && mintAddresses?.length === 1) {
      try {
        console.log('Fetching balance for token account directly...');
        const tokenAccountBalance = await connection.getTokenAccountBalance(addressPubkey);
        
        console.log('Token account balance:', tokenAccountBalance.value);
        
        balances.push({
          mint: mintAddresses[0],
          balance: tokenAccountBalance.value.uiAmount || 0,
          rawBalance: tokenAccountBalance.value.amount,
          decimals: tokenAccountBalance.value.decimals,
        });
      } catch (e) {
        console.warn(`Could not fetch token account balance:`, e);
        // Fall back to zero balance
        balances.push({
          mint: mintAddresses[0],
          balance: 0,
          rawBalance: '0',
          decimals: 0,
        });
      }
    } else {
      // Standard wallet - fetch all token accounts owned by this wallet
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(addressPubkey, {
        programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
      });

      console.log(`Found ${tokenAccounts.value.length} token accounts`);

      const mintFilter = mintAddresses ? new Set(mintAddresses) : null;

      for (const { account } of tokenAccounts.value) {
        const parsedInfo = account.data.parsed?.info;
        if (!parsedInfo) continue;

        const mint = parsedInfo.mint;
        const tokenAmount = parsedInfo.tokenAmount;

        // Skip if we're filtering and this mint isn't in the list
        if (mintFilter && !mintFilter.has(mint)) continue;

        balances.push({
          mint,
          balance: tokenAmount.uiAmount || 0,
          rawBalance: tokenAmount.amount,
          decimals: tokenAmount.decimals,
        });
      }

      // If specific mints were requested, add zero balances for any not found
      if (mintAddresses) {
        const foundMints = new Set(balances.map(b => b.mint));
        for (const mint of mintAddresses) {
          if (!foundMints.has(mint)) {
            // Fetch mint info to get decimals
            try {
              const mintPubkey = new PublicKey(mint);
              const mintInfo = await connection.getParsedAccountInfo(mintPubkey);
              const decimals = (mintInfo.value?.data as { parsed?: { info?: { decimals?: number } } })?.parsed?.info?.decimals || 0;
              
              balances.push({
                mint,
                balance: 0,
                rawBalance: '0',
                decimals,
              });
            } catch (e) {
              console.warn(`Could not fetch mint info for ${mint}:`, e);
              balances.push({
                mint,
                balance: 0,
                rawBalance: '0',
                decimals: 0,
              });
            }
          }
        }
      }
    }

    console.log(`Returning ${balances.length} balance(s)`);

    return new Response(
      JSON.stringify({ success: true, balances }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error fetching balances:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to fetch balances' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
