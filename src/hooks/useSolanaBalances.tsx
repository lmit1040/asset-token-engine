import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface TokenBalance {
  mint: string;
  balance: number;
  rawBalance: string;
  decimals: number;
}

interface UseSolanaBalancesReturn {
  balances: Record<string, TokenBalance>;
  isLoading: boolean;
  error: string | null;
  fetchBalances: (walletAddress: string, mintAddresses?: string[], isTreasuryAccount?: boolean) => Promise<void>;
  getBalance: (mint: string) => TokenBalance | null;
}

export function useSolanaBalances(): UseSolanaBalancesReturn {
  const [balances, setBalances] = useState<Record<string, TokenBalance>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBalances = useCallback(async (walletAddress: string, mintAddresses?: string[], isTreasuryAccount?: boolean) => {
    if (!walletAddress) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const { data, error: fnError } = await supabase.functions.invoke('get-solana-balances', {
        body: {
          walletAddress,
          mintAddresses,
          isTreasuryAccount,
        },
      });

      if (fnError) {
        throw new Error(fnError.message || 'Failed to fetch balances');
      }

      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch balances');
      }

      const balanceMap: Record<string, TokenBalance> = {};
      for (const balance of data.balances) {
        balanceMap[balance.mint] = balance;
      }
      setBalances(balanceMap);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch balances';
      setError(message);
      console.error('Error fetching Solana balances:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getBalance = useCallback((mint: string): TokenBalance | null => {
    return balances[mint] || null;
  }, [balances]);

  return {
    balances,
    isLoading,
    error,
    fetchBalances,
    getBalance,
  };
}
